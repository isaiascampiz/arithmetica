import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import * as prettier from 'prettier';

// Enumerate publishable files through Git, so formatting never traverses private data.
const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
      .toString()
      .split('\0')
      .filter(Boolean),
  ),
];
const config = await prettier.resolveConfig('package.json');
if (!config) throw Error('Repository Prettier configuration is missing.');
const write = process.argv.includes('--write');
let checked = 0;
let changed = 0;
for (const file of files) {
  const info = await prettier.getFileInfo(file, {
    ignorePath: '.prettierignore',
  });
  if (info.ignored || !info.inferredParser) continue;
  let source;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  checked++;
  const formatted = await prettier.format(source, {
    ...config,
    filepath: file,
  });
  if (source === formatted) continue;
  changed++;
  if (write) await writeFile(file, formatted);
  else console.error(file);
}
console.log(
  `${checked} source files checked; ${changed} ${write ? 'formatted' : 'need formatting'}.`,
);
if (!write && changed) process.exitCode = 1;
