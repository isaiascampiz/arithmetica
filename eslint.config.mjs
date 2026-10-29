import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([
    '.next/**',
    '.open-next/**',
    '.wrangler/**',
    '.pnpm-store/**',
    'test-results/**',
    'playwright-report/**',
    'data/**',
  ]),
  { rules: { 'react-hooks/set-state-in-effect': 'off' } },
]);
