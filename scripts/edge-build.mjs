import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
await mkdir('data/edge-build/supabase/functions/arithmetica-api', {
  recursive: true,
});
await build({
  entryPoints: ['src/server/supabase-entry.ts'],
  outfile: 'data/edge-build/supabase/functions/arithmetica-api/index.ts',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  minify: true,
  define: { global: 'globalThis', 'process.env': 'arithmeticaEnvironment' },
  inject: [path.resolve('src/server/edge-environment.ts')],
  alias: {
    'next/headers': path.resolve('src/server/edge-cookies.ts'),
    'next/server': path.resolve('src/server/edge-response.ts'),
  },
  banner: {
    js: 'import {createRequire} from "node:module";import {Buffer} from "node:buffer";import process from "node:process";const require=createRequire(import.meta.url);globalThis.Buffer??=Buffer;globalThis.process??=process;',
  },
});
await writeFile(
  'data/edge-build/supabase/config.toml',
  'project_id = "arithmetica-runtime"\n[functions.arithmetica-api]\nverify_jwt = true\nentrypoint = "./functions/arithmetica-api/index.ts"\n',
);
console.log(
  'Supabase API bundle built from the existing authenticated handlers; no records or credentials included.',
);
