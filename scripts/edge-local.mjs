// Isolated runtime compatibility test: synthetic staging config, loopback bind, no local data fallback.
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const config = JSON.parse(await readFile('data/deployment/staging.runtime.json', 'utf8'));
assert.equal(config.APP_ORIGIN, 'https://arithmetica-staging.arithmetica.workers.dev');
const environment = {
  ...process.env,
  DENO_NO_PACKAGE_JSON: '1',
  ARITHMETICA_LOCAL_PORT: '8788',
  SUPABASE_URL: config.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY,
  ARITHMETICA_DATA_APPROVED: 'true',
  ARITHMETICA_ENVIRONMENT: 'staging',
  ARITHMETICA_APP_ORIGIN: config.APP_ORIGIN,
  ARITHMETICA_CENTER_ID: config.CENTER_ID,
  ARITHMETICA_SESSION_SECRET: config.SESSION_SECRET,
  ARITHMETICA_JOBS_SECRET: config.JOBS_SECRET,
};
const child = spawn(
  process.execPath,
  [
    path.resolve('node_modules/deno/bin.cjs'),
    'run',
    '--no-check',
    '--allow-env',
    `--allow-net=127.0.0.1:8788,${new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname}`,
    `--allow-read=${path.resolve('data/edge-build')}`,
    path.resolve('data/edge-build/supabase/functions/arithmetica-api/index.ts'),
  ],
  { stdio: 'inherit', windowsHide: true, env: environment },
);
process.once('SIGINT', () => child.kill('SIGINT'));
child.once('error', () => {
  console.error('Deno test server failed to start.');
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
