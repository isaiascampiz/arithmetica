type Assets = { fetch(request: Request): Promise<Response> };
type Environment = {
  ASSETS: Assets;
  API_ORIGIN: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  JOBS_SECRET?: string;
};
const secureHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self)',
};
const appCookie = /^(cf-cloud|cf-refresh|cf-staff|cf-kiosk)=/;
function backend(environment: Environment) {
  const upstream = new URL(environment.API_ORIGIN);
  if (
    upstream.protocol !== 'https:' ||
    !/^[a-z]{20}\.supabase\.co$/.test(upstream.hostname) ||
    upstream.pathname !== '/functions/v1/arithmetica-api' ||
    upstream.username ||
    upstream.password ||
    upstream.port ||
    upstream.search ||
    upstream.hash
  )
    throw new Error('Backend configuration is unavailable.');
  return upstream;
}
const worker = {
  async scheduled(_event: unknown, environment: Environment): Promise<void> {
    if (!environment.JOBS_SECRET || !environment.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      throw new Error('Scheduled job credentials are unavailable.');
    const upstream = backend(environment);
    upstream.pathname += '/api/jobs';
    const response = await fetch(upstream, {
      method: 'POST',
      // Workers supports manual/follow only. Reject 3xx below without forwarding credentials.
      redirect: 'manual',
      headers: {
        Authorization: 'Bearer ' + environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'x-arithmetica-job-authorization': 'Bearer ' + environment.JOBS_SECRET,
      },
      signal: AbortSignal.timeout(45000),
    });
    // Never log response payloads, credentials or student records.
    await response.body?.cancel();
    if (!response.ok) throw new Error('Scheduled jobs failed with status ' + response.status);
  },
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        // Fixed configured project only; users cannot choose the proxy destination.
        const upstream = backend(environment);
        upstream.pathname += url.pathname;
        upstream.search = url.search;
        const forwarded = new Request(upstream, request);
        forwarded.headers.delete('Host');
        const sessionCookies = (request.headers.get('cookie') || '')
          .split(';')
          .map((value) => value.trim())
          .filter((value) => appCookie.test(value))
          .join('; ');
        forwarded.headers.delete('cookie');
        if (sessionCookies) forwarded.headers.set('cookie', sessionCookies);
        forwarded.headers.delete('x-arithmetica-job-authorization');
        if (url.pathname === '/api/jobs' && request.headers.has('authorization'))
          forwarded.headers.set(
            'x-arithmetica-job-authorization',
            request.headers.get('authorization')!,
          );
        // Keep the Supabase function gateway's JWT check enabled. App sessions remain cookie based.
        if (!environment.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Gateway key missing');
        forwarded.headers.set(
          'Authorization',
          'Bearer ' + environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        );
        const response = await fetch(forwarded, { redirect: 'manual' });
        const headers = new Headers(response.headers);
        // Provider bot cookies belong to supabase.co, not the app; forward only our host-scoped sessions.
        headers.delete('set-cookie');
        for (const cookie of response.headers.getSetCookie())
          if (appCookie.test(cookie) && !/;\s*Domain=/i.test(cookie))
            headers.append('set-cookie', cookie);
        headers.set('Cache-Control', 'no-store');
        for (const [key, value] of Object.entries(secureHeaders)) headers.set(key, value);
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      } catch {
        return Response.json(
          {
            error:
              'Unable to reach the shared server. Retry with the same request; no success has been recorded.',
          },
          {
            status: 503,
            headers: { ...secureHeaders, 'Cache-Control': 'no-store' },
          },
        );
      }
    }
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', { status: 405 });
    const assetUrl = new URL(url);
    if (/^\/students\/[^/]+\/pouch\/?$/.test(url.pathname)) assetUrl.pathname = '/pouch/index.html';
    else if (
      ['/', '/login', '/kiosk', '/reception'].includes(url.pathname.replace(/\/$/, '') || '/')
    )
      assetUrl.pathname = (url.pathname.replace(/\/$/, '') || '') + '/index.html';
    const response = await environment.ASSETS.fetch(new Request(assetUrl, request));
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(secureHeaders)) headers.set(key, value);
    if (
      assetUrl.pathname.endsWith('.html') ||
      assetUrl.pathname.endsWith('/sw.js') ||
      assetUrl.pathname.endsWith('.txt')
    )
      headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  },
};
export default worker;
