import { staffSession, sameOrigin, throttle } from '@/lib/auth';
import { receptionEntry } from '@/lib/kiosk-attendance';
import { repository } from '@/lib/repository';
import { failure, json } from '@/lib/http';
import { z } from 'zod';
const input = z.union([
  z
    .object({
      token: z.string().trim().min(1).max(100),
      requestId: z.string().uuid(),
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
    await staffSession();
    return json({
      ready: true,
      demo: process.env.DEMO_MODE !== 'false',
      confirmationSeconds: 4,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await staffSession();
    throttle('staff-reception', 60);
    const entry = input.parse(await req.json());
    return json(await repository.transaction((db) => receptionEntry(db, entry)));
  } catch (e) {
    return failure(e);
  }
}
