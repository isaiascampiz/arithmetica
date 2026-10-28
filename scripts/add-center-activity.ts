import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repository, dataFilename, validateDatabase } from '../src/lib/repository';
import {
  addFictionalCenterActivity,
  activityDemoPrefix,
} from '../tests/fixtures/center-activity-demo';
import { dayKey } from '../src/lib/model';

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
  const raw = JSON.parse(await readFile(filename, 'utf8')); // Never initialize or reseed.
  validateDatabase(raw);
  const before = await repository.read(),
    now = new Date();
  const marker = activityDemoPrefix + ':' + dayKey(now, before.operations!.center.timezone);
  if (before.audit.some((a) => a.id === marker)) {
    console.log('Fictional activity samples already loaded today. No records changed.');
    return;
  }
  const preview = structuredClone(before);
  const count = addFictionalCenterActivity(preview, now);
  validateDatabase(preview);
  const backup = path.resolve(
    'data/backups/center-activity-' + now.toISOString().replaceAll(':', '-') + '.json',
  );
  await mkdir(path.dirname(backup), { recursive: true });
  await writeFile(backup, JSON.stringify(before, null, 2), { flag: 'wx', mode: 0o600 });
  await repository.transaction((db) => {
    if (db.revision !== before.revision)
      throw Error('Center changed after backup. Rerun for a fresh backup.');
    addFictionalCenterActivity(db, now);
    validateDatabase(db);
  });
  console.log(
    `Added ${count} explicitly fictional visits. Existing records preserved. Backup: ${backup}`,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
