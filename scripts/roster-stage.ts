import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { stageRoster } from '../src/lib/roster-intake';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length > 3 || extname(args[0]).toLowerCase() !== '.xlsx')
    throw new Error('Usage: pnpm roster:stage <file.xlsx> <YYYY-MM-DD review date> [sheet name]');
  const info = await stat(args[0]);
  if (!info.isFile() || info.size > 5 * 1024 * 1024)
    throw new Error('Expected an XLSX file at most 5 MiB.');
  const staged = await stageRoster(await readFile(args[0]), args[1], args[2]);
  const directory = resolve('data/private-intake');
  await mkdir(directory, { recursive: true });
  const destination = resolve(directory, `${staged.sourceSha256}.pending.json`);
  // Exclusive creation: repeated commands never overwrite reviewed data or replace IDs.
  await writeFile(destination, JSON.stringify(staged, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        mode: 'private-staging-only',
        activeProfilesCreated: 0,
        productionImportReady: false,
        stagedProfiles: staged.profiles.length,
        subjectRows: staged.profiles.reduce((sum, profile) => sum + profile.subjects.length, 0),
        profilesAwaitingSubjectSelection: staged.profiles.filter(
          (profile) => !profile.subjects.length,
        ).length,
        excludedEflRows: staged.excludedSubjectRows.length,
        profilesAwaitingEnrollmentDateReview: staged.profiles.filter(
          (profile) => profile.enrollmentDate === null,
        ).length,
        destination,
      },
      null,
      2,
    ),
  );
}
main().catch((error: unknown) => {
  if (error instanceof Error && 'code' in error)
    console.error(
      error.code === 'EEXIST'
        ? 'This workbook is already staged. No file or IDs were replaced.'
        : 'Private staging file could not be read or written. No active records were changed.',
    );
  else
    console.error(
      error instanceof Error ? error.message : 'Staging failed. No active records were changed.',
    );
  process.exitCode = 1;
});
