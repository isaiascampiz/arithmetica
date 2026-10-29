import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { previewRoster } from '../src/lib/roster-intake';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length > 3 || extname(args[0]).toLowerCase() !== '.xlsx')
    throw new Error('Usage: pnpm roster:preview <file.xlsx> <YYYY-MM-DD review date> [sheet name]');
  const info = await stat(args[0]);
  if (!info.isFile() || info.size > 5 * 1024 * 1024)
    throw new Error('Expected an XLSX file at most 5 MiB.');
  console.log(
    JSON.stringify(await previewRoster(await readFile(args[0]), args[1], args[2]), null, 2),
  );
}
main().catch((error: unknown) => {
  // Filesystem/parser errors can embed private paths or source values; suppress their details.
  console.error(
    error instanceof Error && !('code' in error)
      ? error.message
      : 'Workbook could not be read. No records were changed.',
  );
  process.exitCode = 1;
});
