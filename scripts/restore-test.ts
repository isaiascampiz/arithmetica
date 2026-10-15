import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateDatabase } from '../src/lib/repository';
import { migrateV2 } from '../src/lib/migrate';
import { migrateV3 } from '../src/lib/v3-migrate';
import { createHash } from 'node:crypto';
async function main() {
  const source = process.argv[2];
  if (!source)
    throw new Error(
      'Pass an explicit backup path. This command restores only into a NEW isolated folder, never a live database.',
    );
  const raw = await readFile(source, 'utf8');
  const db = JSON.parse(raw);
  validateDatabase(db);
  migrateV2(db);
  migrateV3(db);
  const folder = path.resolve('data/restore-drills/' + Date.now());
  await mkdir(folder, { recursive: true });
  const target = path.join(folder, 'restored.json');
  await writeFile(target, JSON.stringify(db, null, 2), { flag: 'wx' });
  const restored = JSON.parse(await readFile(target, 'utf8'));
  validateDatabase(restored);
  if (
    JSON.stringify(restored.students.map((s: { id: string }) => s.id)) !==
    JSON.stringify(db.students.map((s: { id: string }) => s.id))
  )
    throw new Error('Restored identity verification failed');
  console.log(
    'Isolated restore verified:',
    target,
    'students:',
    restored.students.length,
    'source SHA256:',
    createHash('sha256').update(raw).digest('hex'),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
