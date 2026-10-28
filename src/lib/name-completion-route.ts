import { z } from 'zod';
import { kioskSession, sameOrigin, staffSession, throttle } from './auth';
import { repository } from './repository';
import { completeStudentName } from './name-completion';
import { failure, json } from './http';
export async function nameCompletionResponse(req: Request, staff: boolean) {
  try {
    sameOrigin(req);
    if (staff) await staffSession();
    else await kioskSession();
    throttle(staff ? 'staff-name-completion' : 'kiosk-name-completion', 240);
    const { prefix } = z
      .object({ prefix: z.string().trim().max(120) })
      .strict()
      .parse(await req.json());
    return json(completeStudentName(await repository.read(), prefix));
  } catch (e) {
    return failure(e);
  }
}
