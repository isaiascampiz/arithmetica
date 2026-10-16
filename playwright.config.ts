import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
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
          command: 'pnpm start --port 3100',
          url: 'http://127.0.0.1:3100/login',
          reuseExistingServer: false,
          timeout: 120000,
          env: {
            DEMO_DATA_PATH: 'data/e2e-v3.json',
            SESSION_SECRET: 'fictional-e2e-session-secret-for-tests-only-123456',
            DEMO_MODE: 'true',
            DATA_ADAPTER: 'local',
            ENABLE_SCHEDULER: 'false',
          },
        },
});
