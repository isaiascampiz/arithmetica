import { cookies } from 'next/headers';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { accounts, sameOrigin, setSession, throttle } from '@/lib/auth';
import { DomainError } from '@/lib/domain';
import { failure, json } from '@/lib/http';
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    throttle('login', 20);
    const { email, password } = z
      .object({ email: z.string().email().max(150), password: z.string().max(150) })
      .parse(await req.json());
    if (process.env.DEMO_MODE === 'false') {
      const { cloudLogin } = await import('@/lib/cloud-auth');
      await cloudLogin(email, password);
      return json({ ok: true });
    }
    const a = accounts().find((a) => a.email === email.toLowerCase());
    if (
      !a ||
      Buffer.byteLength(a.password) !== Buffer.byteLength(password) ||
      !timingSafeEqual(Buffer.from(a.password), Buffer.from(password))
    )
      throw new DomainError('Email or password is incorrect.', 401);
    await setSession('staff', a.role, a.name);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const c = await cookies();
    c.delete('cf-staff');
    c.delete('cf-kiosk');
    c.delete('cf-cloud');
    c.delete('cf-refresh');
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
