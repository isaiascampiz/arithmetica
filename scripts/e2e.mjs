import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { e2eEnvironment, e2eOutputDirectory, testOrigin, testPort } from './e2e-settings.mjs';
const require = createRequire(import.meta.url);
const temporary = path.resolve('data/test-browser-temp');
mkdirSync(temporary, { recursive: true });
// A missing, unique fictional file initializes once; previous test runs are retained.
const runId = randomUUID();
const runDirectory = path.resolve('data/e2e-runs', runId);
const dataPath =
  process.env.ARITHMETICA_E2E_DATA_PATH ||
  process.env.CENTERFLOW_E2E_DATA_PATH ||
  (process.env.E2E_EXTERNAL_SERVER === 'true'
    ? 'data/e2e-v3.json'
    : path.join(runDirectory, 'state.json'));
const env = {
  ...process.env,
  ARITHMETICA_E2E_DATA_PATH: dataPath,
  ARITHMETICA_E2E_OUTPUT_DIR: e2eOutputDirectory(
    process.env.ARITHMETICA_E2E_OUTPUT_DIR ||
      process.env.CENTERFLOW_E2E_OUTPUT_DIR ||
      path.resolve('test-results/runs', runId),
  ),
  TEMP: temporary,
  TMP: temporary,
};
let server, runner;
function launch(args, environment) {
  return spawn(process.execPath, args, {
    stdio: 'inherit',
    env: environment,
    windowsHide: true,
  });
}
function exitCode(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}
async function assertPortFree() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', () =>
      reject(
        Error(
          `Fictional test port ${testPort} is already in use. Choose ARITHMETICA_E2E_PORT; existing servers are never reused.`,
        ),
      ),
    );
    probe.listen(testPort, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
}
async function waitForServer() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null)
      throw Error('The fictional test server exited before becoming ready.');
    try {
      const response = await fetch(testOrigin + '/login', {
        signal: AbortSignal.timeout(1000),
      });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // Only this runner's newly launched server may become available here.
    }
    await delay(100);
  }
  throw Error('The fictional test server did not become ready within 120 seconds.');
}
process.once('SIGINT', () => {
  runner?.kill('SIGINT');
  server?.kill('SIGTERM');
});
let serverExit;
try {
  if (process.env.E2E_EXTERNAL_SERVER !== 'true') {
    await assertPortFree();
    // Direct ownership avoids Playwright's shell/taskkill server teardown on
    // Windows. No existing server or records file is stopped or replaced.
    server = launch(
      [
        require.resolve('next/dist/bin/next'),
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(testPort),
      ],
      { ...env, ...e2eEnvironment(dataPath) },
    );
    serverExit = exitCode(server);
    await waitForServer();
  }
  runner = launch([require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)], {
    ...env,
    E2E_EXTERNAL_SERVER: 'true',
  });
  process.exitCode = await exitCode(runner);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      serverExit,
      delay(5000, undefined, { ref: false }).then(() => server.kill('SIGKILL')),
    ]);
  }
}
