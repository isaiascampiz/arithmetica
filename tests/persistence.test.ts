import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repository } from '../src/lib/repository';
test('serialized concurrent writes persist without dropping records; corrupt data is not reset', async () => {
  await mkdir('data', { recursive: true });
  const folder = await mkdtemp(path.resolve('data/test-repository-'));
  process.env.DEMO_DATA_PATH = path.join(folder, 'state.json');
  const initial = await repository.read();
  const original = initial.revision;
  await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      repository.transaction((db) =>
        db.audit.push({
          id: `test-${i}`,
          action: 'test',
          actor: 'test',
          at: new Date().toISOString(),
          entityId: 'test',
        }),
      ),
    ),
  );
  const persisted = JSON.parse(await readFile(process.env.DEMO_DATA_PATH, 'utf8'));
  assert.equal(persisted.audit.length, initial.audit.length + 30);
  assert.equal(persisted.revision, original + 30);
  assert.equal((await repository.read()).students[0].token, initial.students[0].token);
  const committed = await repository.transaction((db) => {
    db.audit.push({
      id: 'returned-snapshot',
      action: 'test',
      actor: 'test',
      at: new Date().toISOString(),
      entityId: 'test',
    });
    return db;
  });
  assert.equal(committed.revision, original + 31);
  assert.deepEqual(committed, JSON.parse(await readFile(process.env.DEMO_DATA_PATH, 'utf8')));
  const unchanged = await repository.transaction((db) => db);
  assert.equal(unchanged.revision, committed.revision);
  await writeFile(process.env.DEMO_DATA_PATH, 'damaged test data');
  await assert.rejects(repository.read());
  assert.equal(await readFile(process.env.DEMO_DATA_PATH, 'utf8'), 'damaged test data');
});
