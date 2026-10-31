import { defineConfig } from '@playwright/test';
import {
  e2eEnvironment,
  e2eOutputDirectory,
  testOrigin,
  testPort,
} from './scripts/e2e-settings.mjs';
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: e2eOutputDirectory(
    process.env.ARITHMETICA_E2E_OUTPUT_DIR || process.env.CENTERFLOW_E2E_OUTPUT_DIR,
  ),
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  use: {
    baseURL: testOrigin,
    viewport: { width: 1024, height: 768 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-tablet',
      use: {
        browserName: 'chromium',
        channel:
          process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'chrome' : undefined),
      },
    },
  ],
  webServer:
    process.env.E2E_EXTERNAL_SERVER === 'true'
      ? undefined
      : {
          command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${testPort}`,
          url: testOrigin + '/login',
          reuseExistingServer: false,
          timeout: 120000,
          env: e2eEnvironment(),
        },
});
