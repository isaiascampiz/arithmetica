import { sameOrigin, staffSession } from '@/lib/auth';
import { repository } from '@/lib/repository';
import { commandInput, applyCommand } from '@/lib/domain';
import { failure, json } from '@/lib/http';
import { applyV2, v2CommandInput } from '@/lib/v2-domain';
import { applyV3, v3CommandInput } from '@/lib/v3-domain';
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const staff = await staffSession();
    const input = await req.json();
    const requestId =
      typeof input.requestId === 'string' && input.requestId.length <= 100 ? input.requestId : null;
    const result = await repository.transaction((db) => {
      if (requestId && db.operations!.processedRequests.includes(requestId))
        return { duplicate: true };
      let id: unknown;
      if (input.kind === 'v3') id = applyV3(db, v3CommandInput.parse(input.command), staff);
      else if (input.kind === 'v2')
        id = applyV2(db, v2CommandInput.parse(input.command || input), staff);
      else applyCommand(db, commandInput.parse(input), staff);
      if (requestId) db.operations!.processedRequests.push(requestId);
      return { id };
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return failure(e);
  }
}
