import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const require = createRequire(import.meta.url);
const temporary = path.resolve('data/test-browser-temp');
mkdirSync(temporary, { recursive: true });
const result = spawnSync(
  process.execPath,
  [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, TEMP: temporary, TMP: temporary } },
);
process.exit(result.status ?? 1);
