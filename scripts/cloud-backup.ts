import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup } from '../src/lib/backup-archive';
import { validateDatabase } from '../src/lib/repository';

async function main() {
  const environment = process.argv[2],
    destination = process.argv[3];
  assert.ok(
    ['staging', 'production'].includes(environment),
    'Choose staging or production explicitly.',
  );
  assert.ok(
    destination && path.isAbsolute(destination),
    'Pass an explicitly approved absolute backup folder.',
  );
  const privateDirectory = path.resolve('data/deployment');
  const config = JSON.parse(
    await readFile(path.join(privateDirectory, `${environment}.runtime.json`), 'utf8'),
  );
  const plan = JSON.parse(
    await readFile(path.join(privateDirectory, `${environment}-plan.json`), 'utf8'),
  );
  assert.equal(config.CENTER_ID, plan.centerId);
  assert.equal(config.NEXT_PUBLIC_SUPABASE_URL, `https://${plan.projectRef}.supabase.co`);
  const headers = {
    apikey: config.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  async function get(resource: string, init?: RequestInit) {
    const response = await fetch(config.NEXT_PUBLIC_SUPABASE_URL + resource, {
      ...init,
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(45000),
    });
    assert.equal(
      response.status,
      200,
      `Backup source ${resource.split('?')[0]} could not be read.`,
    );
    return response.json();
  }
  const readState = () =>
    get('/rest/v1/rpc/read_centerflow', {
      method: 'POST',
      body: JSON.stringify({ p_center: plan.centerId }),
    });
  let archive;
  // Capture a consistent revision despite concurrent teaching; never silently omit paginated history.
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await readState();
    validateDatabase(state.payload);
    const history: unknown[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await get(
        `/rest/v1/centerflow_state_history?center_id=eq.${plan.centerId}&revision=lt.${state.revision}&order=revision.asc&limit=500&offset=${offset}`,
      );
      history.push(...page);
      if (page.length < 500) break;
    }
    const centers = await get(`/rest/v1/centers?id=eq.${plan.centerId}`);
    const memberships = await get(
      `/rest/v1/staff_memberships?center_id=eq.${plan.centerId}&order=user_id.asc`,
    );
    const versions = await get('/rest/v1/application_versions?order=version.asc');
    assert.deepEqual(
      versions.map((item: { version: number }) => item.version),
      [1, 2, 3, 4, 5],
    );
    const authUsers = [];
    for (const member of memberships) {
      const user = await get(`/auth/v1/admin/users/${member.user_id}`);
      // Password hashes/sessions are intentionally unavailable through this API.
      // Recovery recreates each UUID and requires a new password, preserving record attribution.
      authUsers.push({
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
        app_metadata: user.app_metadata,
        user_metadata: user.user_metadata,
      });
    }
    if ((await readState()).revision !== state.revision) continue;
    const migrations = await Promise.all(
      (await readdir('supabase/migrations'))
        .filter((name) => name.endsWith('.sql'))
        .sort()
        .map(async (name) => ({
          name,
          sql: await readFile(path.join('supabase/migrations', name), 'utf8'),
        })),
    );
    archive = {
      format: 'arithmetica-recovery',
      version: 1,
      at: new Date().toISOString(),
      projectRef: plan.projectRef,
      centerId: plan.centerId,
      state,
      history,
      centers,
      memberships,
      versions,
      authUsers,
      migrations,
      authRecovery:
        'Recreate original UUIDs with new passwords; no passwords, hashes, refresh tokens or deployment secrets are included.',
    };
    break;
  }
  assert.ok(archive, 'Records kept changing. Retry backup; no incomplete backup was saved.');
  const keyPath = path.join(privateDirectory, 'recovery-key.txt');
  let recoveryKey;
  try {
    recoveryKey = (await readFile(keyPath, 'utf8')).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    recoveryKey = randomBytes(32).toString('base64url');
    try {
      await writeFile(keyPath, recoveryKey + '\n', { flag: 'wx', mode: 0o600 });
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
      recoveryKey = (await readFile(keyPath, 'utf8')).trim();
    }
  }
  const key = Buffer.from(recoveryKey, 'base64url');
  const encrypted = encryptBackup(archive, key);
  await mkdir(destination, { recursive: true });
  const target = path.join(
    destination,
    `${environment}-${new Date().toISOString().replaceAll(':', '-')}.arithmetica`,
  );
  await writeFile(target, encrypted, { flag: 'wx', mode: 0o600 });
  assert.deepEqual(decryptBackup(await readFile(target), key), archive);
  console.log(
    JSON.stringify(
      {
        backupFile: target,
        encryptedBytes: encrypted.length,
        revision: archive.state.revision,
        students: archive.state.payload.students.length,
        historicalRevisions: archive.history.length,
        memberships: archive.memberships.length,
        decryptedReadback: 'passed',
        sha256: createHash('sha256').update(encrypted).digest('hex'),
        recoveryKeyFile: keyPath,
        retainKeySeparately: true,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Backup failed.');
  process.exitCode = 1;
});
