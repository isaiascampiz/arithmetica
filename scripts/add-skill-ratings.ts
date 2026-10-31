import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repository, dataFilename, validateDatabase } from '../src/lib/repository';
import {
  addFictionalSkillRatings,
  skillTransitionMarker,
} from '../tests/fixtures/skill-progress-demo';

async function main() {
  if (
    !process.env.DEMO_DATA_PATH ||
    process.env.DEMO_MODE !== 'true' ||
    process.env.DATA_ADAPTER !== 'local' ||
    process.env.PRODUCTION_DATA_APPROVED === 'true'
  )
    throw Error('Explicit fictional local mode and DEMO_DATA_PATH are required.');
  const filename = dataFilename();
  if (!filename.startsWith(path.resolve('data') + path.sep))
    throw Error('Target must be inside data/.');
  const original = JSON.parse(await readFile(filename, 'utf8')); // Never initialize/reseed a missing center.
  validateDatabase(original);
  if (original.schemaVersion !== 3 || !original.operations.center.name.startsWith('FICTIONAL'))
    throw Error('A labeled fictional V3 center is required.');
  const before = await repository.read();
  if (before.audit.some((a) => a.id === skillTransitionMarker)) {
    console.log('Fictional skill ratings already exist; no records changed.');
    return;
  }
  const preview = structuredClone(before);
  addFictionalSkillRatings(preview);
  validateDatabase(preview);
  const backup = path.resolve(
    'data/backups/skill-ratings-' + new Date().toISOString().replaceAll(':', '-') + '.json',
  );
  await mkdir(path.dirname(backup), { recursive: true });
  await writeFile(backup, JSON.stringify(before, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  const count = await repository.transaction((db) => {
    if (db.revision !== before.revision)
      throw Error('Center changed after backup; rerun to obtain a fresh backup.');
    const added = addFictionalSkillRatings(db);
    validateDatabase(db);
    return added;
  });
  console.log(
    'Added fictional skill ratings to ' +
      count +
      ' fictional observations on existing Rowan visits. Backup: ' +
      backup,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
