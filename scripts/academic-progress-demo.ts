import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { academicProgressDemo } from '../tests/fixtures/academic-progress-demo';
import { validateDatabase } from '../src/lib/repository';

async function main() {
  if (
    process.env.DEMO_MODE === 'false' ||
    (process.env.DATA_ADAPTER && process.env.DATA_ADAPTER !== 'local') ||
    process.env.PRODUCTION_DATA_APPROVED === 'true'
  )
    throw Error('Academic fixtures require fictional local development mode.');
  const target = path.resolve('data/academic-progress-demo-v5.json'),
    db = academicProgressDemo();
  validateDatabase(db);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(db, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log('Created separate FICTIONAL Academic progress demo:', target);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
