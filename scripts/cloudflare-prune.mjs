// Remove obsolete proxy privileges; the backend owns persistence and session secrets.
// Protected local configuration retains recovery copies. This never deletes database records.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const environment = process.argv[2];
assert.ok(['staging', 'production'].includes(environment));
const config = environment === 'production' ? 'wrangler.production.jsonc' : 'wrangler.jsonc';
for (const name of [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SESSION_SECRET',
  'APP_ORIGIN',
  'CENTER_ID',
  'NEXT_PUBLIC_SUPABASE_URL',
]) {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve('node_modules/wrangler/bin/wrangler.js'),
      'secret',
      'delete',
      name,
      '--config',
      config,
    ],
    { input: 'y\n', encoding: 'utf8', windowsHide: true, env: { ...process.env, CI: 'true' } },
  );
  if (result.error || result.status !== 0 || !result.stdout.includes('Deleted secret')) {
    console.error('Proxy secret removal failed for ' + name);
    process.exit(1);
  }
  console.log(environment + ': removed unused proxy secret ' + name);
}
