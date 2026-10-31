import { AsyncLocalStorage } from 'node:async_hooks';

type Options = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?: string;
  maxAge?: number;
};
type Context = { values: Map<string, string>; outgoing: string[] };
const context = new AsyncLocalStorage<Context>();

/** Request-scoped cookie adapter for the shared HTTP handlers on Supabase's Node-compatible runtime. */
export async function cookies() {
  const current = context.getStore();
  if (!current) throw new Error('Cookie access requires an active HTTP request.');
  const set = (name: string, value: string, options: Options = {}) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid session cookie name.');
    current.values.set(name, value);
    current.outgoing.push(
      [
        `${name}=${encodeURIComponent(value)}`,
        `Path=${options.path || '/'}`,
        ...(options.httpOnly ? ['HttpOnly'] : []),
        ...(options.secure ? ['Secure'] : []),
        ...(options.sameSite ? [`SameSite=${options.sameSite}`] : []),
        ...(options.maxAge !== undefined ? [`Max-Age=${Math.trunc(options.maxAge)}`] : []),
      ].join('; '),
    );
  };
  return {
    get: (name: string) =>
      current.values.has(name) ? { name, value: current.values.get(name)! } : undefined,
    set,
    delete: (name: string) => {
      set(name, '', {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 0,
      });
      current.values.delete(name);
    },
  };
}
export async function withRequestCookies(
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const values = new Map<string, string>();
  for (const pair of (request.headers.get('cookie') || '').split(';')) {
    const at = pair.indexOf('=');
    if (at < 1) continue;
    try {
      values.set(pair.slice(0, at).trim(), decodeURIComponent(pair.slice(at + 1).trim()));
    } catch {
      /* Ignore malformed cookies; authentication will fail closed. */
    }
  }
  const current: Context = { values, outgoing: [] };
  return context.run(current, async () => {
    const response = await handler();
    const headers = new Headers(response.headers);
    for (const cookie of current.outgoing) headers.append('Set-Cookie', cookie);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}
