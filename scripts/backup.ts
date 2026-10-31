import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repository, validateDatabase } from '../src/lib/repository';
import { createHash } from 'node:crypto';
async function main() {
  const db = await repository.read();
  validateDatabase(db);
  const raw = JSON.stringify(db, null, 2);
  await mkdir('data/backups', { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const file = path.resolve('data/backups/arithmetica-' + stamp + '.json');
  await writeFile(file, raw, { flag: 'wx', mode: 0o600 });
  await writeFile(file + '.sha256', createHash('sha256').update(raw).digest('hex'), { flag: 'wx' });
  console.log('Verified backup written:', file);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
