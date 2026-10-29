import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../src/lib/client';

test('concurrent expired requests share one refresh and preserve mutation request IDs', async (t) => {
  let refreshed = false,
    refreshes = 0;
  const attempts: { url: string; options?: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    if (url === '/api/session') {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      refreshed = true;
      return Response.json({ ok: true });
    }
    attempts.push({ url, options });
    return Response.json(refreshed ? { ok: true } : { error: 'Expired' }, {
      status: refreshed ? 200 : 401,
    });
  });
  const command = { requestId: 'fictional-durable-id', kind: 'attendance' };
  await Promise.all([request('/api/state'), request('/api/commands', 'POST', command)]);
  assert.equal(refreshes, 1);
  const mutations = attempts.filter((attempt) => attempt.url === '/api/commands');
  assert.equal(mutations.length, 2);
  assert.deepEqual(mutations[0].options, mutations[1].options);
  assert.equal(mutations[1].options?.body, JSON.stringify(command));
  assert.ok(attempts.every((attempt) => attempt.options?.cache === 'no-store'));
});

test('public kiosk and sign-in failures never refresh a staff session', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    calls.push(url);
    return Response.json({ error: 'Please ask staff.' }, { status: 401 });
  });
  for (const url of ['/api/kiosk', '/api/kiosk/name', '/api/auth', '/api/session'])
    await assert.rejects(request(url, 'POST', {}), /Please ask staff/);
  assert.deepEqual(calls, ['/api/kiosk', '/api/kiosk/name', '/api/auth', '/api/session']);
});

test('a failed refresh reports the original error without replaying a mutation', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    calls.push(url);
    if (url === '/api/session') throw Error('Connection interrupted');
    return Response.json({ error: 'Please sign in to continue.' }, { status: 401 });
  });
  await assert.rejects(
    request('/api/commands', 'POST', { requestId: 'retry-me' }),
    /Please sign in/,
  );
  assert.deepEqual(calls, ['/api/commands', '/api/session']);
});

test('gateway HTML and malformed JSON produce actionable errors without leaking response bodies', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>private gateway detail</html>', { status: 502 }),
  );
  await assert.rejects(request('/api/state'), {
    message: 'The server returned an unreadable response (HTTP 502). Please retry.',
  });
});

test('JSON errors retain their server message and valid false bodies are serialized', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: string, options?: RequestInit) => {
    assert.equal(options?.body, 'false');
    assert.deepEqual(options?.headers, { 'Content-Type': 'application/json' });
    return Response.json({ error: 'Fictional stale version.' }, { status: 409 });
  });
  await assert.rejects(request('/api/commands', 'POST', false), /Fictional stale version/);
});
