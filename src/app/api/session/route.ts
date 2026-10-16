import { refreshCloudSession } from '@/lib/cloud-auth';
import { sameOrigin } from '@/lib/auth';
import { failure, json } from '@/lib/http';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
export async function GET(req: Request) {
  const origin =
    process.env.APP_ORIGIN ||
    `${new URL(req.url).protocol}//${req.headers.get('host') || new URL(req.url).host}`;
  if (req.headers.get('sec-fetch-site') === 'cross-site')
    return json({ error: 'Cross-site refresh is not allowed.' }, 403);
  try {
    await refreshCloudSession();
    return NextResponse.redirect(new URL('/', origin));
  } catch {
    const c = await cookies();
    c.delete('cf-cloud');
    c.delete('cf-refresh');
    return NextResponse.redirect(new URL('/login', origin));
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await refreshCloudSession();
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
