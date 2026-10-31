import { cookies } from 'next/headers';
import { DomainError } from './domain';
import type { Role, Staff } from './model';
function config() {
  if (
    process.env.DATA_ADAPTER !== 'supabase' ||
    process.env.COOKIE_SECURE !== 'true' ||
    !process.env.APP_ORIGIN?.startsWith('https://')
  )
    throw new DomainError(
      'Real-data mode requires shared Supabase storage and a configured HTTPS origin with secure cookies.',
      503,
    );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !process.env.CENTER_ID)
    throw new DomainError('Cloud authentication is not configured.', 503);
  if (process.env.PRODUCTION_DATA_APPROVED !== 'true')
    throw new DomainError('Organizational real-data authorization has not been enabled.', 503);
  return { url, key };
}
export async function cloudLogin(email: string, password: string) {
  const { url, key } = config();
  const res = await fetch(url + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  if (!res.ok) throw new DomainError('Email or password is incorrect.', 401);
  const data = await res.json();
  const c = await cookies();
  const options = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
  };
  c.set('cf-cloud', data.access_token, { ...options, maxAge: data.expires_in });
  c.set('cf-refresh', data.refresh_token, { ...options, maxAge: 43200 });
  await cloudStaff(data.access_token);
}
export async function cloudStaff(token?: string): Promise<Staff> {
  const { url, key } = config();
  const access = token || (await cookies()).get('cf-cloud')?.value;
  if (!access) throw new DomainError('Please sign in to continue.', 401);
  const userResponse = await fetch(url + '/auth/v1/user', {
    headers: { apikey: key, Authorization: 'Bearer ' + access },
    cache: 'no-store',
  });
  if (!userResponse.ok) throw new DomainError('Please sign in to continue.', 401);
  const user = await userResponse.json();
  const response = await fetch(
    `${url}/rest/v1/staff_memberships?center_id=eq.${encodeURIComponent(process.env.CENTER_ID!)}&user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=role,display_name`,
    {
      headers: { apikey: key, Authorization: 'Bearer ' + access },
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new DomainError('Staff membership could not be verified.', 403);
  const memberships = await response.json();
  const member = memberships[0];
  if (!member || !['owner', 'instructor', 'assistant'].includes(member.role))
    throw new DomainError('No active center membership.', 403);
  return {
    name: member.display_name,
    role: member.role as Role,
    id: user.id,
    email: user.email,
  };
}
export async function refreshCloudSession() {
  const { url, key } = config();
  const c = await cookies(),
    refresh = c.get('cf-refresh')?.value;
  if (!refresh) throw new DomainError('Please sign in to continue.', 401);
  const response = await fetch(url + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
    cache: 'no-store',
  });
  if (!response.ok) throw new DomainError('Please sign in to continue.', 401);
  const data = await response.json();
  const options = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
  };
  c.set('cf-cloud', data.access_token, { ...options, maxAge: data.expires_in });
  c.set('cf-refresh', data.refresh_token, { ...options, maxAge: 43200 });
  return cloudStaff(data.access_token);
}
