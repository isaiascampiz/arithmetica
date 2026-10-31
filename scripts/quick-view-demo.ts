import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { quickViewDemo } from '../tests/fixtures/quick-view-demo';
import { validateDatabase } from '../src/lib/repository';

async function main() {
  if (
    process.env.DEMO_MODE === 'false' ||
    (process.env.DATA_ADAPTER && process.env.DATA_ADAPTER !== 'local') ||
    process.env.PRODUCTION_DATA_APPROVED === 'true'
  )
    throw Error('Quick View fixtures require fictional local development mode.');
  const target = path.resolve('data/quick-view-demo.json');
  const db = quickViewDemo();
  validateDatabase(db);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(db, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log('Created separate FICTIONAL Quick View demo:', target);
  console.log(
    'Use DEMO_DATA_PATH=data/quick-view-demo.json with ENABLE_SCHEDULER=false on a separate local app process.',
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
