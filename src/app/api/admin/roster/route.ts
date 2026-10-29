import { sameOrigin, staffSession } from '@/lib/auth';
import { DomainError } from '@/lib/domain';
import { failure, json } from '@/lib/http';
import { repository } from '@/lib/repository';
import {
  applyRosterImport,
  assertRosterDestination,
  prepareRosterImport,
} from '@/lib/roster/import';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const staff = await staffSession();
    if (staff.role !== 'owner') throw new DomainError('Only the owner can import a roster.', 403);
    if (
      process.env.DEMO_MODE !== 'false' ||
      process.env.DATA_ADAPTER !== 'supabase' ||
      process.env.PRODUCTION_DATA_APPROVED !== 'true'
    )
      throw new DomainError('Roster imports require the approved production workspace.', 409);
    const reader = req.body?.getReader();
    if (!reader) throw new DomainError('Choose a prepared roster file.');
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new DomainError('Prepared roster exceeds the 2 MiB import limit.', 413);
      }
      chunks.push(value);
    }
    const prepared = prepareRosterImport(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    assertRosterDestination(prepared.roster, process.env.DEPLOYMENT_ENV);
    const result = await repository.transaction((db) => applyRosterImport(db, prepared, staff));
    return json({ ok: true, ...result });
  } catch (error) {
    return failure(error);
  }
}
