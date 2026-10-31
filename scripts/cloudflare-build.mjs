import { spawnSync } from 'node:child_process';
for (const script of ['scripts/edge-build.mjs', 'scripts/static-build.mjs']) {
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
