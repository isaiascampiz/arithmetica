/** Restore a decrypted synthetic archive into a NEW isolated staging center, never over live state. */
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { decryptBackup } from '../src/lib/backup-archive';
import { validateDatabase } from '../src/lib/repository';

async function main() {
  const mode = process.argv[2],
    source = process.argv[3],
    directory = 'data/deployment';
  const config = JSON.parse(await readFile(`${directory}/staging.runtime.json`, 'utf8'));
  const plan = JSON.parse(await readFile(`${directory}/staging-plan.json`, 'utf8'));
  assert.equal(config.CENTER_ID, plan.centerId);
  assert.equal(config.NEXT_PUBLIC_SUPABASE_URL, `https://${plan.projectRef}.supabase.co`);
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  if (mode === 'prepare') {
    assert.ok(source, 'Pass an explicit encrypted synthetic staging backup.');
    const key = Buffer.from(
      (await readFile(`${directory}/recovery-key.txt`, 'utf8')).trim(),
      'base64url',
    );
    const archive = decryptBackup(await readFile(source), key) as {
      format: string;
      version: number;
      projectRef: string;
      centerId: string;
      state: { payload: import('../src/lib/model').Database; revision: number };
      history: { revision: number; payload: unknown; saved_at: string }[];
      memberships: { user_id: string; role: string; display_name: string; active: boolean }[];
    };
    assert.equal(archive.format, 'arithmetica-recovery');
    assert.equal(archive.version, 1);
    assert.equal(archive.projectRef, plan.projectRef);
    assert.equal(archive.centerId, plan.centerId);
    validateDatabase(archive.state.payload);
    assert.match(archive.state.payload.operations!.center.name, /^Arithmetica staging/);
    assert.ok(archive.state.payload.students.length > 0);
    assert.ok(
      archive.state.payload.students.every((student) => student.name.startsWith('Fictional ')),
      'Never restore real records into staging.',
    );
    const centerId = randomUUID();
    const quote = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
    const sql = [
      '-- Synthetic encrypted-backup restore drill. NEW center only; no deletes, updates or resets.',
      'begin;',
      `insert into public.centers(id,name,timezone) values(${quote(centerId)},'Arithmetica staging isolated recovery','America/Los_Angeles');`,
      ...archive.memberships.map(
        (item) =>
          `insert into public.staff_memberships(center_id,user_id,role,display_name,active) values(${quote(centerId)},${quote(item.user_id)},${quote(item.role)},${quote(item.display_name)},${item.active});`,
      ),
      'commit;',
      `select name from public.centers where id=${quote(centerId)};`,
    ].join('\n');
    await writeFile(`${directory}/staging-restore.sql`, sql, { flag: 'wx', mode: 0o600 });
    await writeFile(
      `${directory}/staging-restore-plan.json`,
      JSON.stringify(
        {
          centerId,
          sourceCenterId: plan.centerId,
          payloadHash: hash(archive.state.payload),
          historyHashes: archive.history.map((item) => ({
            revision: item.revision,
            hash: hash(item.payload),
          })),
          revision: archive.state.revision,
          memberships: archive.memberships,
          archivePath: source,
        },
        null,
        2,
      ),
      { flag: 'wx', mode: 0o600 },
    );
    console.log(
      'Synthetic restore SQL prepared from the encrypted archive. Apply only to staging, then run verify.',
    );
  } else {
    assert.ok(['load', 'verify'].includes(mode), 'Choose prepare, load or verify.');
    const restore = JSON.parse(await readFile(`${directory}/staging-restore-plan.json`, 'utf8'));
    assert.equal(restore.sourceCenterId, plan.centerId);
    assert.notEqual(restore.centerId, plan.centerId);
    const headers = {
      apikey: config.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };
    async function get(resource: string, init?: RequestInit) {
      const response = await fetch(config.NEXT_PUBLIC_SUPABASE_URL + resource, {
        ...init,
        headers,
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(response.status, 200);
      return response.json();
    }
    if (mode === 'load') {
      const centers = await get(`/rest/v1/centers?id=eq.${restore.centerId}`);
      assert.equal(centers[0]?.name, 'Arithmetica staging isolated recovery');
      const key = Buffer.from(
        (await readFile(`${directory}/recovery-key.txt`, 'utf8')).trim(),
        'base64url',
      );
      const archive = decryptBackup(await readFile(restore.archivePath), key) as {
        state: { payload: unknown; revision: number };
        history: { revision: number; payload: unknown; saved_at: string }[];
      };
      assert.equal(hash(archive.state.payload), restore.payloadHash);
      const existing = await get('/rest/v1/rpc/read_centerflow', {
        method: 'POST',
        body: JSON.stringify({ p_center: restore.centerId }),
      });
      if (existing)
        assert.equal(
          hash(existing.payload),
          restore.payloadHash,
          'Never overwrite an occupied restore target.',
        );
      else {
        const rows = await get(
          `/rest/v1/centerflow_state_history?center_id=eq.${restore.centerId}&order=revision.asc`,
        );
        for (const row of rows)
          assert.equal(
            hash(row.payload),
            restore.historyHashes.find(
              (item: { revision: number }) => item.revision === row.revision,
            )?.hash,
          );
        const missing = archive.history.filter(
          (item) => !rows.some((row: { revision: number }) => row.revision === item.revision),
        );
        for (const [resource, body] of [
          [
            'centerflow_state_history',
            missing.map((item) => ({ ...item, center_id: restore.centerId })),
          ],
          [
            'centerflow_states',
            [
              {
                center_id: restore.centerId,
                revision: archive.state.revision,
                schema_version: 3,
                payload: archive.state.payload,
              },
            ],
          ],
        ] as const) {
          if (!body.length) continue;
          const response = await fetch(config.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/' + resource, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30000),
          });
          assert.equal(
            response.status,
            201,
            'Append-only synthetic restore failed; source records remain untouched.',
          );
        }
      }
    }
    const state = await get('/rest/v1/rpc/read_centerflow', {
      method: 'POST',
      body: JSON.stringify({ p_center: restore.centerId }),
    });
    assert.equal(state.revision, restore.revision);
    assert.equal(
      hash(state.payload),
      restore.payloadHash,
      'Restored records must match every saved value.',
    );
    const history = await get(
      `/rest/v1/centerflow_state_history?center_id=eq.${restore.centerId}&order=revision.asc`,
    );
    assert.deepEqual(
      history.map((item: { revision: number; payload: unknown }) => ({
        revision: item.revision,
        hash: hash(item.payload),
      })),
      restore.historyHashes,
    );
    const members = await get(
      `/rest/v1/staff_memberships?center_id=eq.${restore.centerId}&order=user_id.asc`,
    );
    const membershipValues = (member: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(member).filter(([key]) => key !== 'center_id'));
    assert.deepEqual(members.map(membershipValues), restore.memberships.map(membershipValues));
    const original = await get('/rest/v1/rpc/read_centerflow', {
      method: 'POST',
      body: JSON.stringify({ p_center: plan.centerId }),
    });
    assert.equal(
      hash(original.payload),
      restore.payloadHash,
      'The source center must remain untouched by the drill.',
    );
    console.log(
      JSON.stringify(
        {
          isolatedRestore: 'passed',
          students: state.payload.students.length,
          historicalRevisions: history.length,
          memberships: members.length,
          everyPayloadValueMatched: true,
          originalUnchanged: true,
          realStudentTesting: false,
        },
        null,
        2,
      ),
    );
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Restore drill failed.');
  process.exitCode = 1;
});
