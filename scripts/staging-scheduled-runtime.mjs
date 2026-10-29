// Execute the actual Worker scheduled handler in Cloudflare's local runtime, staging only.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const wranglerRequire = createRequire(path.resolve('node_modules/wrangler/package.json'));
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const config = JSON.parse(await readFile('data/deployment/staging.runtime.json', 'utf8'));
assert.equal(config.APP_ORIGIN, 'https://arithmetica-staging.arithmetica.workers.dev');
const bundle = await build({
  entryPoints: ['src/server/static-worker.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-10-28',
    host: '127.0.0.1',
    port: 0,
    log: new Log(LogLevel.ERROR),
    bindings: {
      API_ORIGIN: config.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/arithmetica-api',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      JOBS_SECRET: config.JOBS_SECRET,
    },
  }),
);
try {
  const worker = await runtime.getWorker();
  const result = await worker.scheduled({ cron: '*/15 * * * *' });
  assert.equal(result.outcome, 'ok');
  console.log(
    'Cloudflare scheduled runtime: actual handler reached the synthetic staging backend successfully.',
  );
} finally {
  await runtime.dispose();
}
