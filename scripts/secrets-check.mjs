// Checks actual configured values without printing credentials or passing them as process arguments.
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadDeploymentToken } from './private-credential.mjs';

const secrets = new Set();
for (const environment of ['staging', 'production']) {
  const config = JSON.parse(await readFile(`data/deployment/${environment}.runtime.json`, 'utf8'));
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SESSION_SECRET',
    'JOBS_SECRET',
  ])
    if (typeof config[key] === 'string' && config[key].length >= 24) secrets.add(config[key]);
}
const keyFile = (await readFile('data/deployment/recovery-key.txt', 'utf8')).trim();
assert.ok(keyFile.length >= 40);
secrets.add(keyFile);
secrets.add(await loadDeploymentToken());
const secretCount = secrets.size;
let privateStudentNamesChecked = 0;
if (process.argv.includes('--roster')) {
  const rosterPath = process.argv[process.argv.indexOf('--roster') + 1];
  assert.ok(rosterPath, 'Pass the approved private intake artifact explicitly.');
  const roster = JSON.parse(await readFile(rosterPath, 'utf8'));
  for (const profile of roster.profiles) {
    const name = `${profile.firstName} ${profile.lastName}`;
    assert.ok(name.length >= 3);
    secrets.add(name);
    privateStudentNamesChecked++;
  }
}
const patterns = [...secrets].map((value) => Buffer.from(value));
const hasSecret = (bytes) => patterns.some((value) => bytes.includes(value));
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { maxBuffer: 20 * 1024 * 1024 },
)
  .toString()
  .split('\0')
  .filter(Boolean);
let sourceFiles = 0,
  artifactFiles = 0,
  historyBlobs = 0;
const exposedPaths = new Set();
for (const file of files) {
  let bytes;
  try {
    bytes = await readFile(file);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  sourceFiles++;
  if (hasSecret(bytes)) exposedPaths.add(file);
}
async function scanArtifacts(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) await scanArtifacts(target);
    else if (item.isFile()) {
      artifactFiles++;
      if (hasSecret(await readFile(target))) exposedPaths.add(target);
    }
  }
}
await scanArtifacts('data/browser-build/out');
await scanArtifacts('data/edge-build/supabase/functions/arithmetica-api');
const objects = execFileSync('git', ['rev-list', '--objects', '--all'], {
  maxBuffer: 30 * 1024 * 1024,
})
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((row) => row.split(' ')[0]);
for (let start = 0; start < objects.length; start += 80) {
  const batch = execFileSync('git', ['cat-file', '--batch'], {
    input: objects.slice(start, start + 80).join('\n') + '\n',
    maxBuffer: 100 * 1024 * 1024,
  });
  let offset = 0;
  while (offset < batch.length) {
    const end = batch.indexOf(10, offset),
      [id, type, size] = batch.subarray(offset, end).toString().split(' ');
    const length = Number(size);
    assert.ok(end >= 0 && Number.isInteger(length));
    const bytes = batch.subarray(end + 1, end + 1 + length);
    if (type === 'blob') {
      historyBlobs++;
      if (hasSecret(bytes)) exposedPaths.add(`Git history object ${id}`);
    }
    offset = end + 1 + length + 1;
  }
}
console.log(
  JSON.stringify(
    {
      configuredValuesChecked: secretCount,
      privateStudentNamesChecked,
      sourceFiles,
      artifactFiles,
      historyBlobs,
      exposedPaths: [...exposedPaths],
      credentialValuesLogged: false,
    },
    null,
    2,
  ),
);
if (exposedPaths.size) process.exitCode = 1;
