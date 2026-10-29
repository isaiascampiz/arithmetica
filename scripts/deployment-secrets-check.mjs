// Compare provider-side SHA-256 digests without revealing credential values.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadDeploymentToken } from './private-credential.mjs';
const token = await loadDeploymentToken();
for (const environment of ['staging', 'production']) {
  const plan = JSON.parse(await readFile(`data/deployment/${environment}-plan.json`, 'utf8'));
  const config = JSON.parse(await readFile(`data/deployment/${environment}.runtime.json`, 'utf8'));
  const result = spawnSync(
    process.execPath,
    [
      path.resolve('node_modules/supabase/dist/supabase.js'),
      'secrets',
      'list',
      '--project-ref',
      plan.projectRef,
      '--output',
      'json',
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 45000,
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
    },
  );
  assert.equal(result.status, 0, environment + ': provider secret metadata could not be read.');
  const secrets = JSON.parse(result.stdout);
  const expected = {
    ARITHMETICA_DATA_APPROVED: config.PRODUCTION_DATA_APPROVED,
    ARITHMETICA_ENVIRONMENT: environment,
    ARITHMETICA_APP_ORIGIN: config.APP_ORIGIN,
    ARITHMETICA_CENTER_ID: config.CENTER_ID,
    ARITHMETICA_SESSION_SECRET: config.SESSION_SECRET,
    ARITHMETICA_JOBS_SECRET: config.JOBS_SECRET,
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(typeof value, 'string');
    // This CLI calls the provider's digest field "value"; never print it on mismatch.
    assert.ok(
      secrets.find((item) => item.name === name)?.value ===
        createHash('sha256').update(value).digest('hex'),
      environment + ': backend secret mismatch for ' + name,
    );
  }
  const proxy = spawnSync(
    process.execPath,
    [
      path.resolve('node_modules/wrangler/bin/wrangler.js'),
      'secret',
      'list',
      '--config',
      environment === 'production' ? 'wrangler.production.jsonc' : 'wrangler.jsonc',
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 45000 },
  );
  assert.equal(proxy.status, 0, environment + ': proxy secret metadata could not be read.');
  assert.deepEqual(
    JSON.parse(proxy.stdout)
      .map((item) => item.name)
      .sort(),
    ['JOBS_SECRET', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  );
  console.log(
    environment + ': all six backend app secrets match; proxy has only the two required secrets.',
  );
}
