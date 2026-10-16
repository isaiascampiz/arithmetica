import { staffSession, sameOrigin } from '@/lib/auth';
import { repository } from '@/lib/repository';
import { runDueJobs } from '@/lib/reports';
import { DomainError } from '@/lib/domain';
import { failure, json } from '@/lib/http';
export async function POST(req: Request) {
  try {
    const key = process.env.JOBS_SECRET;
    const authorized = Boolean(key && req.headers.get('authorization') === `Bearer ${key}`);
    if (!authorized) {
      sameOrigin(req);
      if ((await staffSession()).role !== 'owner')
        throw new DomainError('Only the owner can run due jobs.', 403);
    }
    const changes = await repository.transaction((db) => runDueJobs(db));
    return json({ changes });
  } catch (e) {
    return failure(e);
  }
}
