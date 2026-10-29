// Auth and idempotency check using the fictional staging center only.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const config = JSON.parse(await readFile('data/deployment/staging.runtime.json', 'utf8'));
assert.equal(config.APP_ORIGIN, 'https://arithmetica-staging.arithmetica.workers.dev');
const invoke = (authorization) =>
  fetch(config.APP_ORIGIN + '/api/jobs', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
    signal: AbortSignal.timeout(45000),
  });
assert.equal((await invoke()).status, 403);
assert.equal((await invoke('Bearer FictionalInvalidSecret')).status, 403);
for (let attempt = 0; attempt < 2; attempt++) {
  const response = await invoke('Bearer ' + config.JOBS_SECRET);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const result = await response.json();
  assert.equal(typeof result.changes, 'number');
  if (attempt === 1) assert.equal(result.changes, 0);
}
console.log(
  'Staging jobs: missing/wrong authorization denied; valid call and idempotent retry passed.',
);
