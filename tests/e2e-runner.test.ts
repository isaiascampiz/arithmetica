import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type AddressInfo } from 'node:net';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { e2eOutputDirectory } from '../scripts/e2e-settings.mjs';

test('browser artifact overrides stay in a dedicated test-results subfolder', () => {
  assert.equal(
    e2eOutputDirectory('test-results/runs/fictional-check'),
    path.resolve('test-results/runs/fictional-check'),
  );
  for (const value of [
    'data',
    'data/e2e-runs',
    'test-results',
    'test-results/../data',
    '../outside',
  ])
    assert.throws(() => e2eOutputDirectory(value), /dedicated subfolder/);
});

test('the browser runner refuses occupied ports without stopping or reusing their server', async () => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const port = (server.address() as AddressInfo).port;
    const result = spawnSync(process.execPath, ['scripts/e2e.mjs', '--list'], {
      env: { ...process.env, CENTERFLOW_E2E_PORT: String(port), E2E_EXTERNAL_SERVER: 'false' },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /already in use/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
