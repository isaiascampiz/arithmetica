import { spawn } from 'node:child_process';
import path from 'node:path';

// Deploy static assets plus the small API proxy. The database is never initialized here.
const child = spawn(
  process.execPath,
  [path.resolve('node_modules/wrangler/bin/wrangler.js'), 'deploy', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, OPEN_NEXT_DEPLOY: 'true' },
  },
);
child.once('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
