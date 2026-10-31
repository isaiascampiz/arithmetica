import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify, sameOrigin } from '../src/lib/auth';
test('sessions reject tampering and expiration and retain server-signed role', () => {
  const token = sign({
    role: 'instructor',
    name: 'Fictional Staff',
    expires: Date.now() + 60000,
  });
  assert.equal(verify(token)?.role, 'instructor');
  assert.equal(verify(token.replace(/.$/, '!')), null);
  assert.equal(verify(sign({ role: 'owner', name: 'Test', expires: 0 })), null);
  assert.equal(verify(undefined), null);
});
test('local browser host passes but missing or foreign origins fail', () => {
  sameOrigin(
    new Request('http://localhost:3100/api/auth', {
      headers: { host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100' },
    }),
  );
  assert.throws(
    () =>
      sameOrigin(
        new Request('http://localhost:3100/api/auth', {
          headers: {
            host: '127.0.0.1:3100',
            origin: 'https://untrusted.example',
          },
        }),
      ),
    /origin/,
  );
  assert.throws(() => sameOrigin(new Request('http://localhost:3100/api/auth')), /origin/);
});
