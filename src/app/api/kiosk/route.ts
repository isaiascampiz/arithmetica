import { z } from 'zod';
import { cookies } from 'next/headers';
import { kioskSession, sameOrigin, setSession, staffSession, throttle } from '@/lib/auth';
import { receptionEntry } from '@/lib/kiosk-attendance';
import { repository } from '@/lib/repository';
import { failure, json } from '@/lib/http';
const receptionInput = z.union([
  z
    .object({
      token: z.string().trim().min(1).max(100),
      requestId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      name: z.string().trim().min(2).max(120),
      requestId: z.string().uuid(),
    })
    .strict(),
]);
export async function GET() {
  try {
    await kioskSession();
    return json({
      ready: true,
      demo: process.env.DEMO_MODE !== 'false',
      confirmationSeconds: 4,
    });
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
    const entry = receptionInput.parse(await req.json());
    const result = await repository.transaction((db) => {
      return receptionEntry(db, entry);
    });
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
