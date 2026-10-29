import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEdgeEnvironment } from '../src/server/edge-environment';
test('edge environment reads approved aliases without changing the provider environment or permitting demo fallback', () => {
  const source = Object.freeze({
    SUPABASE_URL: 'https://fictional.invalid',
    SUPABASE_ANON_KEY: 'Fictional anon',
    SUPABASE_SERVICE_ROLE_KEY: 'Fictional service',
    ARITHMETICA_SESSION_SECRET: 'Fictional session',
    ARITHMETICA_ENVIRONMENT: 'staging',
    ARITHMETICA_DATA_APPROVED: 'true',
    DEMO_MODE: 'true',
    DATA_ADAPTER: 'local',
    UNRELATED_SECRET: 'Fictional unrelated',
  });
  const mapped = createEdgeEnvironment(source);
  assert.equal(mapped.DEMO_MODE, 'false');
  assert.equal(mapped.DATA_ADAPTER, 'supabase');
  assert.equal(mapped.COOKIE_SECURE, 'true');
  assert.equal(mapped.ENABLE_SCHEDULER, 'false');
  assert.equal(mapped.NEXT_PUBLIC_SUPABASE_URL, source.SUPABASE_URL);
  assert.equal(mapped.SESSION_SECRET, source.ARITHMETICA_SESSION_SECRET);
  assert.equal('UNRELATED_SECRET' in mapped, false);
  assert.equal(source.DEMO_MODE, 'true');
  assert.equal(
    createEdgeEnvironment({ PRODUCTION_DATA_APPROVED: 'true' }).PRODUCTION_DATA_APPROVED,
    undefined,
  );
});
