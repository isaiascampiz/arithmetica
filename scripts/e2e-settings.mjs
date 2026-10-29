import path from 'node:path';

export const testPort = Number(process.env.CENTERFLOW_E2E_PORT || 3100);
if (!Number.isInteger(testPort) || testPort < 1024 || testPort > 65535)
  throw Error('Invalid fictional test server port.');
export const testOrigin = `http://127.0.0.1:${testPort}`;

export function e2eOutputDirectory(value) {
  const root = path.resolve('test-results');
  if (!value) return root;
  const output = path.resolve(value),
    relative = path.relative(root, output);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith('..' + path.sep) ||
    path.isAbsolute(relative)
  )
    throw Error('Browser artifacts require a dedicated subfolder of test-results.');
  return output;
}

export function e2eEnvironment(
  dataPath = process.env.CENTERFLOW_E2E_DATA_PATH || 'data/e2e-v3.json',
) {
  return {
    DEMO_DATA_PATH: dataPath,
    SESSION_SECRET: 'fictional-e2e-session-secret-for-tests-only-123456',
    DEMO_MODE: 'true',
    DATA_ADAPTER: 'local',
    PRODUCTION_DATA_APPROVED: 'false',
    ENABLE_SCHEDULER: 'false',
  };
}
