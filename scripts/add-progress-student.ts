import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repository, dataFilename, validateDatabase } from '../src/lib/repository';
import {
  addInteractiveProgressStudent,
  progressStudentId,
} from '../tests/fixtures/interactive-progress-student';

async function main() {
  if (
    !process.env.DEMO_DATA_PATH ||
    process.env.DEMO_MODE !== 'true' ||
    process.env.DATA_ADAPTER !== 'local' ||
    process.env.PRODUCTION_DATA_APPROVED === 'true'
  )
    throw Error('Explicit fictional local mode and DEMO_DATA_PATH are required.');
  // Require an existing file; this operation must never initialize/reseed a missing center.
  const filename = dataFilename();
  const root = path.resolve('data') + path.sep;
  if (!filename.startsWith(root))
    throw Error('The fictional target must be inside the local data directory.');
  const raw = await readFile(filename, 'utf8');
  const original = JSON.parse(raw);
  validateDatabase(original);
  if (original.schemaVersion !== 3 || !original.operations.center.name.startsWith('FICTIONAL'))
    throw Error('Only an explicitly labeled fictional V3 center is supported.');
  const current = await repository.read();
  if (current.students.some((s) => s.id === progressStudentId)) {
    console.log('Fictional Rowan is already present; no records changed.');
    return;
  }
  const backup = path.resolve(
    'data/backups/progress-addition-' + new Date().toISOString().replaceAll(':', '-') + '.json',
  );
  await mkdir(path.dirname(backup), { recursive: true });
  await writeFile(backup, JSON.stringify(current, null, 2), { flag: 'wx', mode: 0o600 });
  await repository.transaction((db) => {
    if (db.revision !== current.revision)
      throw Error('Center changed after backup; rerun to obtain a fresh backup.');
    addInteractiveProgressStudent(db);
    validateDatabase(db);
  });
  console.log('Added Fictional Rowan Progress Demo to:', filename);
  console.log('Preserved prior records. Backup:', backup);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
