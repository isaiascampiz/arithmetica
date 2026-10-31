import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { emptyProductionCenter } from '../src/lib/center-initialization';
import { validateDatabase } from '../src/lib/repository';

async function main() {
  const [source, actor] = process.argv.slice(2);
  if (!source || !actor)
    throw new Error('Usage: pnpm center:prepare <reviewed-center.json> <setup-actor>');
  const db = emptyProductionCenter(JSON.parse(await readFile(source, 'utf8')), actor);
  validateDatabase(db);
  await mkdir(resolve('data/production-setup'), { recursive: true });
  const destination = resolve('data/production-setup/empty-center.json');
  await writeFile(destination, JSON.stringify(db, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    'Prepared a new empty production baseline. No existing records or cloud database were changed.',
  );
}
main().catch((error) => {
  console.error(
    error?.code === 'EEXIST'
      ? 'A production baseline already exists. It was not overwritten.'
      : 'Center baseline could not be prepared. Check the reviewed settings and arguments.',
  );
  process.exitCode = 1;
});
