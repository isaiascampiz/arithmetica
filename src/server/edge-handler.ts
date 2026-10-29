import { withRequestCookies } from './edge-cookies';
import * as account from '../app/api/account/route';
import * as auth from '../app/api/auth/route';
import * as commands from '../app/api/commands/route';
import * as exports from '../app/api/export/route';
import * as jobs from '../app/api/jobs/route';
import * as kiosk from '../app/api/kiosk/route';
import * as kioskName from '../app/api/kiosk/name/route';
import * as reception from '../app/api/reception/route';
import * as receptionName from '../app/api/reception/name/route';
import * as reports from '../app/api/reports/route';
import * as session from '../app/api/session/route';
import * as state from '../app/api/state/route';
import * as roster from '../app/api/admin/roster/route';

const routes: Record<string, Record<string, unknown>> = {
  '/api/account': account,
  '/api/auth': auth,
  '/api/commands': commands,
  '/api/export': exports,
  '/api/jobs': jobs,
  '/api/kiosk': kiosk,
  '/api/kiosk/name': kioskName,
  '/api/reception': reception,
  '/api/reception/name': receptionName,
  '/api/reports': reports,
  '/api/session': session,
  '/api/state': state,
  '/api/admin/roster': roster,
};
export async function handleEdgeRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Supabase's gateway keeps the function-name prefix in the request URL.
  const pathname = url.pathname
    .replace(/^\/arithmetica-api(?=\/)/, '')
    .replace(/^\/functions\/v1\/arithmetica-api(?=\/)/, '');
  const handler = routes[pathname]?.[request.method];
  if (typeof handler !== 'function')
    return Response.json(
      { error: 'Route or method not found.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  if (process.env.DATA_ADAPTER !== 'supabase' || process.env.DEMO_MODE !== 'false')
    return Response.json({ error: 'Shared cloud configuration is required.' }, { status: 503 });
  if (pathname === '/api/jobs' && request.headers.has('x-arithmetica-job-authorization')) {
    const forwarded = new Request(request);
    forwarded.headers.set('authorization', request.headers.get('x-arithmetica-job-authorization')!);
    return withRequestCookies(forwarded, () => handler(forwarded));
  }
  return withRequestCookies(request, () => handler(request));
}
