import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialFindings, isPrivatePath } from '../scripts/repository-check.mjs';

test('publication checks reject private records, credentials and generated paths', () => {
  for (const name of [
    'data/demo-v1.json',
    '.env.local',
    'config/.env.production',
    'private.xlsx',
    'exports/attendance.csv',
    'backup.dpapi',
    '.next/server/app.js',
  ])
    assert.equal(isPrivatePath(name), true, name);
  for (const name of [
    '.env.example',
    'src/lib/model.ts',
    'docs/architecture.md',
    'tests/fixtures/pending-roster.ts',
  ])
    assert.equal(isPrivatePath(name), false, name);
});

test('credential checks report categories without returning credential values', () => {
  const token = ['ghp', '_', 'a'.repeat(36)].join('');
  assert.deepEqual(credentialFindings(Buffer.from(token)), ['GitHub token']);
  assert.equal(JSON.stringify(credentialFindings(Buffer.from(token))).includes(token), false);
  const jwt = (role: string) =>
    [
      Buffer.from('{}').toString('base64url'),
      Buffer.from(JSON.stringify({ role })).toString('base64url'),
      'signature',
    ].join('.');
  // JWT credentials use a JSON header with the standard eyJ prefix.
  const service = jwt('service_role').replace(
    /^e30/,
    Buffer.from('{"alg":"HS256"}').toString('base64url'),
  );
  const anon = jwt('anon').replace(/^e30/, Buffer.from('{"alg":"HS256"}').toString('base64url'));
  assert.deepEqual(credentialFindings(Buffer.from(service)), ['privileged service-role JWT']);
  assert.deepEqual(credentialFindings(Buffer.from(anon)), []);
});
