import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/server/static-worker';

test('scheduled jobs use scoped server authorization, fail visibly and never send secrets to another host', async () => {
  const previous = globalThis.fetch;
  const origin = 'https://' + 'a'.repeat(20) + '.supabase.co/functions/v1/arithmetica-api';
  const environment = {
    ASSETS: { fetch: async () => new Response('shell') },
    API_ORIGIN: origin,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'FictionalGatewayKey',
    JOBS_SECRET: 'FictionalJobKey',
  };
  let calls = 0;
  try {
    globalThis.fetch = async (input, init) => {
      calls++;
      assert.equal(String(input), origin + '/api/jobs');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'manual');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer FictionalGatewayKey');
      assert.equal(headers.get('x-arithmetica-job-authorization'), 'Bearer FictionalJobKey');
      assert.equal(headers.get('cookie'), null);
      return Response.json({ changes: [] });
    };
    await worker.scheduled({}, environment);
    await assert.rejects(
      worker.scheduled({}, { ...environment, API_ORIGIN: 'https://unapproved.invalid' }),
    );
    await assert.rejects(worker.scheduled({}, { ...environment, JOBS_SECRET: undefined }));
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
    await assert.rejects(worker.scheduled({}, environment), /status 503/);
    globalThis.fetch = async () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'https://unapproved.invalid' },
      });
    await assert.rejects(worker.scheduled({}, environment), /status 302/);
  } finally {
    globalThis.fetch = previous;
  }
});

test('static proxy sends gateway credentials only upstream, keeps session cookies and refuses a foreign backend', async () => {
  const previous = globalThis.fetch;
  const origin = 'https://' + 'a'.repeat(20) + '.supabase.co/functions/v1/arithmetica-api';
  const assets = { fetch: async () => new Response('shell') };
  try {
    globalThis.fetch = async (input) => {
      const request = input as Request;
      assert.equal(request.url, origin + '/api/auth');
      assert.equal(request.headers.get('authorization'), 'Bearer FictionalGatewayKey');
      assert.equal(request.headers.get('cookie'), 'cf-cloud=FictionalSession');
      assert.equal(request.headers.get('host'), null);
      const response = Response.json(
        { ok: true },
        {
          headers: {
            'Set-Cookie': 'cf-cloud=FictionalResult; Secure; HttpOnly; SameSite=Strict; Path=/',
          },
        },
      );
      response.headers.append(
        'Set-Cookie',
        '__cf_bm=FictionalProviderCookie; Secure; HttpOnly; SameSite=None; Domain=supabase.co',
      );
      return response;
    };
    const response = await worker.fetch(
      new Request('https://app.invalid/api/auth', {
        method: 'POST',
        headers: { Cookie: 'cf-cloud=FictionalSession', Host: 'app.invalid' },
        body: '{}',
      }),
      {
        ASSETS: assets,
        API_ORIGIN: origin,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'FictionalGatewayKey',
      },
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie')!, /HttpOnly/);
    assert.doesNotMatch(response.headers.get('set-cookie')!, /__cf_bm|supabase\.co/);
    assert.equal(response.headers.get('authorization'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    const denied = await worker.fetch(new Request('https://app.invalid/api/state'), {
      ASSETS: assets,
      API_ORIGIN: 'https://unapproved.invalid/functions/v1/arithmetica-api',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'FictionalGatewayKey',
    });
    assert.equal(denied.status, 503);
  } finally {
    globalThis.fetch = previous;
  }
});
test('pouch routing serves only a generic shell, and an unreachable API fails visibly without a local fallback', async () => {
  const previous = globalThis.fetch;
  const environment = {
    API_ORIGIN: 'https://' + 'a'.repeat(20) + '.supabase.co/functions/v1/arithmetica-api',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'FictionalGatewayKey',
    ASSETS: {
      fetch: async (request: Request) => {
        assert.equal(new URL(request.url).pathname, '/pouch/index.html');
        return new Response('generic shell');
      },
    },
  };
  const shell = await worker.fetch(
    new Request('https://app.invalid/students/fictional-id/pouch'),
    environment,
  );
  assert.equal(await shell.text(), 'generic shell');
  assert.equal(shell.headers.get('cache-control'), 'no-store');
  try {
    globalThis.fetch = async () => {
      throw new Error('Network unavailable');
    };
    const failed = await worker.fetch(new Request('https://app.invalid/api/state'), environment);
    assert.equal(failed.status, 503);
    assert.match((await failed.json()).error, /no success has been recorded/);
  } finally {
    globalThis.fetch = previous;
  }
});
