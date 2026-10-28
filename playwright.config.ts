import { defineConfig } from '@playwright/test';
const testPort = Number(process.env.CENTERFLOW_E2E_PORT || 3100);
if (!Number.isInteger(testPort) || testPort < 1024 || testPort > 65535)
  throw Error('Invalid fictional test server port.');
const testOrigin = `http://127.0.0.1:${testPort}`;
export default defineConfig({
  testDir: './tests/e2e',
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
          env: {
            DEMO_DATA_PATH: process.env.CENTERFLOW_E2E_DATA_PATH || 'data/e2e-v3.json',
            SESSION_SECRET: 'fictional-e2e-session-secret-for-tests-only-123456',
            DEMO_MODE: 'true',
            DATA_ADAPTER: 'local',
            PRODUCTION_DATA_APPROVED: 'false',
            ENABLE_SCHEDULER: 'false',
          },
        },
});
