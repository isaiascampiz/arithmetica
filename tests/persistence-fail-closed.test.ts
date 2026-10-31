import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { seed } from '../src/lib/seed';
import { migrateV2 } from '../src/lib/migrate';
import { repository } from '../src/lib/repository';

async function isolatedFile(t: TestContext) {
  const keys = ['DEMO_DATA_PATH', 'DATA_ADAPTER', 'DEMO_MODE', 'PRODUCTION_DATA_APPROVED'];
  const original = keys.map((key) => process.env[key]);
  t.after(() => {
    keys.forEach((key, index) => {
      if (original[index] === undefined) delete process.env[key];
      else process.env[key] = original[index];
    });
  });
  await fs.mkdir('data', { recursive: true });
  const folder = await fs.mkdtemp(path.resolve('data/test-fail-closed-'));
  const filename = path.join(folder, 'state.json');
  process.env.DEMO_DATA_PATH = filename;
  process.env.DATA_ADAPTER = 'local';
  process.env.DEMO_MODE = 'true';
  process.env.PRODUCTION_DATA_APPROVED = 'false';
  return filename;
}

for (const version of [1, 2] as const) {
  for (const failure of ['backup', 'temporary write', 'rename'] as const) {
    test(`V${version} ${failure} ENOENT rejects without replacing records; migration can retry`, async (t) => {
      const filename = await isolatedFile(t);
      const db = seed(new Date('2026-10-14T18:00:00Z'));
      db.students[0].name = 'Fictional preservation sentinel';
      db.observations[0].reviewedAt = '2026-10-14T19:00:00Z';
      db.observations[0].reviewedBy = 'Fictional reviewer';
      db.audit.push({
        id: 'fictional-existing-audit',
        action: 'test',
        actor: 'Fictional reviewer',
        at: '2026-10-14T19:00:00Z',
        entityId: db.observations[0].id,
      });
      if (version === 2) migrateV2(db, new Date('2026-10-14T20:00:00Z'));
      const raw = JSON.stringify(db, null, 2);
      await fs.writeFile(filename, raw);

      const error = Object.assign(new Error(`Injected ${failure} failure`), {
        code: 'ENOENT',
      });
      let injected = false;
      if (failure === 'rename') {
        const rename = fs.rename;
        t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
          if (!injected && args[0] === filename + '.tmp') {
            injected = true;
            throw error;
          }
          return rename(...args);
        });
      } else {
        const writeFile = fs.writeFile;
        const target = filename + (failure === 'backup' ? `.v${version}-backup.json` : '.tmp');
        t.mock.method(fs, 'writeFile', async (...args: Parameters<typeof fs.writeFile>) => {
          if (!injected && args[0] === target) {
            injected = true;
            throw error;
          }
          return writeFile(...args);
        });
      }

      await assert.rejects(repository.read(), (caught) => caught === error);
      assert.equal(injected, true);
      assert.equal(await fs.readFile(filename, 'utf8'), raw);
      if (failure !== 'backup')
        assert.equal(await fs.readFile(filename + `.v${version}-backup.json`, 'utf8'), raw);

      t.mock.restoreAll();
      const migrated = await repository.read();
      assert.equal(migrated.schemaVersion, 3);
      assert.equal(migrated.revision, db.revision + 3 - version);
      assert.deepEqual(migrated.students, db.students);
      assert.deepEqual(migrated.visits, db.visits);
      assert.deepEqual(migrated.observations, db.observations);
      assert.deepEqual(migrated.homework, db.homework);
      assert.deepEqual(migrated.audit.slice(0, db.audit.length), db.audit);
      assert.deepEqual(
        migrated.audit.slice(db.audit.length).map((event) => event.action),
        version === 1
          ? ['schema-upgrade:1-to-2', 'schema-upgrade:2-to-3']
          : ['schema-upgrade:2-to-3'],
      );
      assert.equal(await fs.readFile(filename + `.v${version}-backup.json`, 'utf8'), raw);
      assert.deepEqual(JSON.parse(await fs.readFile(filename, 'utf8')), migrated);
    });
  }
}

test('only a missing initial database file initializes fictional V3 data', async (t) => {
  const filename = await isolatedFile(t);
  const db = await repository.read();
  assert.equal(db.schemaVersion, 3);
  assert.equal(db.students.length, 96);
  assert.deepEqual(JSON.parse(await fs.readFile(filename, 'utf8')), db);
});

test('an initial database read permission error propagates without writing data', async (t) => {
  const filename = await isolatedFile(t);
  const raw = JSON.stringify(seed());
  await fs.writeFile(filename, raw);
  const error = Object.assign(new Error('Injected read permission failure'), {
    code: 'EACCES',
  });
  const readFile = fs.readFile;
  t.mock.method(fs, 'readFile', async (...args: Parameters<typeof fs.readFile>) => {
    if (args[0] === filename) throw error;
    return readFile(...args);
  });
  const write = t.mock.method(fs, 'writeFile');
  await assert.rejects(repository.read(), (caught) => caught === error);
  assert.equal(write.mock.callCount(), 0);
  assert.equal(await readFile(filename, 'utf8'), raw);
});
