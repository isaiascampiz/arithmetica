// Explicit environment only; scoped credential is unsealed in memory and never put in arguments or logs.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadDeploymentToken } from './private-credential.mjs';
const environment = process.argv[2],
  action = process.argv[3] || 'deploy';
assert.ok(['staging', 'production'].includes(environment));
assert.ok(['deploy', 'secrets', 'list'].includes(action));
const plan = JSON.parse(await readFile(`data/deployment/${environment}-plan.json`, 'utf8'));
const args =
  action === 'deploy'
    ? [
        'functions',
        'deploy',
        'arithmetica-api',
        '--project-ref',
        plan.projectRef,
        '--use-api',
        '--workdir',
        path.resolve('data/edge-build'),
      ]
    : action === 'secrets'
      ? [
          'secrets',
          'set',
          '--env-file',
          path.resolve(`data/deployment/${environment}.edge-secrets.env`),
          '--project-ref',
          plan.projectRef,
        ]
      : ['functions', 'list', '--project-ref', plan.projectRef];
const token = await loadDeploymentToken();
const child = spawn(
  process.execPath,
  [path.resolve('node_modules/supabase/dist/supabase.js'), ...args],
  {
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
    stdio: 'inherit',
    windowsHide: true,
  },
);
child.once('error', () => {
  console.error('Supabase deployment process failed.');
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
