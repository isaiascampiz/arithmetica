import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { seed } from '../src/lib/seed';
import { migrateV2 } from '../src/lib/migrate';
import { repository, validateDatabase } from '../src/lib/repository';
test('Supabase adapter retries revision conflicts and never falls back to local data', async () => {
  const env = { ...process.env };
  const fetch = globalThis.fetch;
  const db = seed();
  migrateV2(db);
  let remote = structuredClone(db),
    writes = 0;
  process.env.DATA_ADAPTER = 'supabase';
  process.env.CENTER_ID = 'fictional-test-center';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fictional.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fictional-test-only-key';
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/read_centerflow'))
      return new Response(JSON.stringify({ revision: remote.revision, payload: remote }));
    const args = JSON.parse(init!.body as string);
    writes++;
    if (writes === 1) {
      remote.revision++;
      return new Response('false');
    }
    assert.equal(args.p_expected_revision, remote.revision);
    remote = args.p_payload;
    return new Response('true');
  };
  try {
    const committed = await repository.transaction((db) => {
      db.audit.push({
        id: 'concurrent-cloud-test',
        action: 'test',
        actor: 'Fictional Test',
        at: new Date().toISOString(),
        entityId: 'test',
      });
      return db;
    });
    assert.equal(writes, 2);
    assert.deepEqual(committed, remote);
    assert.equal(committed.revision, remote.revision);
    assert.deepEqual(await repository.transaction((db) => db), remote);
    assert.equal(writes, 2);
    assert.equal(remote.audit.filter((a) => a.id === 'concurrent-cloud-test').length, 1);
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    await assert.rejects(repository.read(), /no local fallback/);
  } finally {
    globalThis.fetch = fetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
test('a populated V1 file upgrades with an untouched backup and restores into an isolated file', async () => {
  await mkdir('data', { recursive: true });
  const dir = await mkdtemp(path.resolve('data/v2-upgrade-test-'));
  const raw = JSON.stringify(seed());
  const source = path.join(dir, 'v1.json');
  await writeFile(source, raw);
  process.env.DEMO_DATA_PATH = source;
  const db = await repository.read();
  assert.equal(db.schemaVersion, 3);
  assert.equal(await readFile(source + '.v1-backup.json', 'utf8'), raw);
  const restore = JSON.parse(await readFile(source + '.v1-backup.json', 'utf8'));
  validateDatabase(restore);
  migrateV2(restore);
  const target = path.join(dir, 'isolated-restored.json');
  await writeFile(target, JSON.stringify(restore));
  const restored = JSON.parse(await readFile(target, 'utf8'));
  validateDatabase(restored);
  assert.deepEqual(restored.students, db.students);
  assert.deepEqual(restored.visits, db.visits);
});
