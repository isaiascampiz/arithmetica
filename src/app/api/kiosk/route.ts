import { z } from 'zod';
import { cookies } from 'next/headers';
import { kioskSession, sameOrigin, setSession, staffSession, throttle } from '@/lib/auth';
import { kioskScan } from '@/lib/kiosk-attendance';
import { repository } from '@/lib/repository';
import { failure, json } from '@/lib/http';
export async function GET() {
  try {
    await kioskSession();
    return json({ ready: true, demo: process.env.DEMO_MODE !== 'false' });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(req: Request) {
  try {
    sameOrigin(req);
    await staffSession();
    await setSession('kiosk', 'kiosk', 'Entrance kiosk');
    (await cookies()).delete('cf-staff');
    (await cookies()).delete('cf-cloud');
    (await cookies()).delete('cf-refresh');
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await kioskSession();
    throttle('kiosk', 60);
    const { token } = z
      .object({ token: z.string().trim().min(1).max(100) })
      .parse(await req.json());
    const result = await repository.transaction((db) => {
      return kioskScan(db, token);
    });
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
