import { staffSession } from '@/lib/auth';
import { DomainError } from '@/lib/domain';
import { repository } from '@/lib/repository';
import { failure } from '@/lib/http';
export async function GET() {
  try {
    if ((await staffSession()).role !== 'owner')
      throw new DomainError('Only an owner can export a backup.', 403);
    return new Response(JSON.stringify(await repository.read(), null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="centerflow-fictional-backup.json"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
