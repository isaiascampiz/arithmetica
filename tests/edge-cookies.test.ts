import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cookies, withRequestCookies } from '../src/server/edge-cookies';

test('parallel cloud requests keep session reads and outgoing cookies isolated', async () => {
  const run = (value: string) =>
    withRequestCookies(
      new Request('https://app.invalid/api/auth', {
        headers: { Cookie: `cf-cloud=${value}` },
      }),
      async () => {
        const jar = await cookies();
        await Promise.resolve();
        assert.equal(jar.get('cf-cloud')?.value, value);
        jar.set('cf-kiosk', value, {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 43200,
          path: '/',
        });
        return Response.json({ ok: true });
      },
    );
  const [first, second] = await Promise.all([run('FictionalOne'), run('FictionalTwo')]);
  assert.match(first.headers.get('set-cookie')!, /cf-kiosk=FictionalOne/);
  assert.doesNotMatch(first.headers.get('set-cookie')!, /FictionalTwo/);
  assert.match(second.headers.get('set-cookie')!, /cf-kiosk=FictionalTwo/);
  assert.match(
    first.headers.get('set-cookie')!,
    /HttpOnly; Secure; SameSite=strict; Max-Age=43200/,
  );
  assert.equal(first.headers.get('cache-control'), 'no-store');
  await assert.rejects(cookies(), /active HTTP request/);
});
test('malformed cookies fail closed and locking deletes the staff session with matching security attributes', async () => {
  const response = await withRequestCookies(
    new Request('https://app.invalid/api/kiosk', {
      headers: { Cookie: 'cf-cloud=%invalid; cf-refresh=Fictional' },
    }),
    async () => {
      const jar = await cookies();
      assert.equal(jar.get('cf-cloud'), undefined);
      jar.delete('cf-refresh');
      assert.equal(jar.get('cf-refresh'), undefined);
      return Response.json({ ok: true });
    },
  );
  assert.match(
    response.headers.get('set-cookie')!,
    /cf-refresh=; Path=\/; HttpOnly; Secure; SameSite=strict; Max-Age=0/,
  );
});
