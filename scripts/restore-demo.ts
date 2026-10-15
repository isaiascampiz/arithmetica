import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { seed } from '../src/lib/seed';
import { migrateV2 } from '../src/lib/migrate';
import { migrateV3 } from '../src/lib/v3-migrate';
import { validateDatabase } from '../src/lib/repository';

async function main() {
  if (
    process.env.DEMO_MODE === 'false' ||
    (process.env.DATA_ADAPTER && process.env.DATA_ADAPTER !== 'local') ||
    process.env.PRODUCTION_DATA_APPROVED === 'true'
  )
    throw new Error('Demo restoration is only allowed in fictional local development mode.');
  const dataRoot = path.resolve('data');
  const target = path.resolve(process.argv[2] || 'data/demo-v1.json');
  const relative = path.relative(dataRoot, target);
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !target.endsWith('.json')
  )
    throw new Error('Choose a JSON file inside this project’s data directory.');
  const expected = Array.from({ length: 96 }, (_, i) => `demo-student-${i + 1}`);
  try {
    const existing = JSON.parse(await readFile(target, 'utf8'));
    validateDatabase(existing);
    const ids = new Set(existing.students.map((student: { id: string }) => student.id));
    if (!expected.every((id) => ids.has(id)))
      throw new Error(
        'Existing data is not the complete demo roster; preserved without overwriting.',
      );
    console.log(
      `Existing ${existing.students.length} students preserved; all 96 fictional demo identities present. No write.`,
    );
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // Reconstruct only checked-in fictional fixtures. Never copy a local records file to the cloud.
  const db = seed();
  migrateV2(db);
  migrateV3(db);
  validateDatabase(db);
  if (db.students.length !== 96 || !expected.every((id) => db.students.some((s) => s.id === id)))
    throw new Error('Fictional roster verification failed.');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(db, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(
    `Restored 96 fictional students at ${relative}; schema ${db.schemaVersion}. Existing files are never overwritten.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
