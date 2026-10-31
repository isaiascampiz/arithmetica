import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'build', ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, ARITHMETICA_BUILD: 'true' } },
);
process.exit(result.status ?? 1);
