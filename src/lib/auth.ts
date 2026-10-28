import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { Role, Staff } from './model';
import { DomainError } from './domain';
const runtime = globalThis as typeof globalThis & { centerSecret?: string };
function secret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length < 32)
    throw new Error('SESSION_SECRET must be at least 32 characters.');
  return configured || (runtime.centerSecret ??= randomBytes(48).toString('hex'));
}
type Session = { role: Role | 'kiosk'; name: string; expires: number };
export function sign(session: Session) {
  const value = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${value}.${createHmac('sha256', secret()).update(value).digest('base64url')}`;
}
export function verify(token: string | undefined): Session | null {
  if (!token) return null;
  try {
    const [value, mac] = token.split('.');
    const expected = createHmac('sha256', secret()).update(value).digest('base64url');
    if (
      !mac ||
      mac.length !== expected.length ||
      !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
    )
      return null;
    const session = JSON.parse(Buffer.from(value, 'base64url').toString()) as Session;
    return session.expires > Date.now() &&
      ['owner', 'instructor', 'assistant', 'kiosk'].includes(session.role)
      ? session
      : null;
  } catch {
    return null;
  }
}
export async function staffSession(): Promise<Staff> {
  if (process.env.DEMO_MODE === 'false') {
    const { cloudStaff } = await import('./cloud-auth');
    return cloudStaff();
  }
  const session = verify((await cookies()).get('cf-staff')?.value);
  if (!session || session.role === 'kiosk')
    throw new DomainError('Please sign in to continue.', 401);
  const staff = {
    role: session.role,
    name: session.name,
    id: 'demo:' + session.role,
    email: accounts().find((a) => a.role === session.role)?.email,
  };
  const { repository } = await import('./repository');
  const { staffProfile } = await import('./staff-profile');
  if (staffProfile(await repository.read(), staff).disabledAt)
    throw new DomainError('This account has been deactivated.', 401);
  return staff;
}
export async function kioskSession() {
  const s = verify((await cookies()).get('cf-kiosk')?.value);
  if (s?.role !== 'kiosk') throw new DomainError('Ask a staff member to open this kiosk.', 401);
}
export async function setSession(type: 'staff' | 'kiosk', role: Session['role'], name: string) {
  if (process.env.DEMO_MODE === 'false' && !process.env.SESSION_SECRET)
    throw new DomainError('Cloud kiosk requires a permanent SESSION_SECRET.', 503);
  (await cookies()).set(
    `cf-${type}`,
    sign({ role, name, expires: Date.now() + 12 * 60 * 60 * 1000 }),
    {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: 43200,
    },
  );
}
export const accounts = () => [
  {
    email: 'owner@demo.center',
    password: process.env.DEMO_OWNER_PASSWORD || 'CenterDemo!2026',
    role: 'owner' as Role,
    name: 'Alex Morgan',
  },
  {
    email: 'instructor@demo.center',
    password: process.env.DEMO_INSTRUCTOR_PASSWORD || 'TeachDemo!2026',
    role: 'instructor' as Role,
    name: 'Jamie Ellis',
  },
  {
    email: 'assistant@demo.center',
    password: process.env.DEMO_ASSISTANT_PASSWORD || 'HelpDemo!2026',
    role: 'assistant' as Role,
    name: 'Sam Reed',
  },
];
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // Next may normalize the internal request URL to localhost. The browser's
  // actual Host is authoritative locally; HTTPS reverse proxies set APP_ORIGIN.
  const expected =
    process.env.APP_ORIGIN ||
    `${new URL(request.url).protocol}//${request.headers.get('host') || new URL(request.url).host}`;
  if (!origin || origin !== expected) throw new DomainError('Request origin is not allowed.', 403);
}
const buckets = globalThis as typeof globalThis & {
  centerBuckets?: Map<string, { count: number; until: number }>;
};
export function throttle(key: string, limit: number) {
  const map = (buckets.centerBuckets ??= new Map());
  const now = Date.now();
  for (const [k, b] of map) if (b.until < now) map.delete(k);
  const b = map.get(key) ?? { count: 0, until: now + 60000 };
  b.count++;
  map.set(key, b);
  if (b.count > limit) throw new DomainError('Too many attempts. Please wait a minute.', 429);
}
