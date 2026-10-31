import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/hosted',
  outputDir: `test-results/hosted-${Date.now()}`,
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: [['list']],
  use: {
    baseURL: 'https://arithmetica-staging.arithmetica.workers.dev',
    browserName: 'chromium',
    channel: process.platform === 'win32' ? 'chrome' : undefined,
    viewport: { width: 1024, height: 768 },
    trace: 'off',
    screenshot: 'only-on-failure',
  },
});
