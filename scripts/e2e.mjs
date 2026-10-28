import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const temporary = path.resolve('data/test-browser-temp');
mkdirSync(temporary, { recursive: true });
// A missing, unique fictional file initializes once; previous test runs are retained.
const runDirectory = path.resolve('data/e2e-runs', randomUUID());
const dataPath =
  process.env.CENTERFLOW_E2E_DATA_PATH ||
  (process.env.E2E_EXTERNAL_SERVER === 'true'
    ? 'data/e2e-v3.json'
    : path.join(runDirectory, 'state.json'));
const result = spawnSync(
  process.execPath,
  [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, CENTERFLOW_E2E_DATA_PATH: dataPath, TEMP: temporary, TMP: temporary },
  },
);
process.exit(result.status ?? 1);
