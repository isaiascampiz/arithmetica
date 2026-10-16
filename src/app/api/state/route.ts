import { staffSession } from '@/lib/auth';
import { repository } from '@/lib/repository';
import { failure, json } from '@/lib/http';
import { synchronizePreparation } from '@/lib/v3-planning';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const staff = await staffSession();
    await repository.transaction((db) => synchronizePreparation(db));
    const db = await repository.read();
    return json({
      ...db,
      staff,
      runtime: {
        demo: process.env.DEMO_MODE !== 'false',
        adapter: process.env.DATA_ADAPTER || 'local',
        scheduler: process.env.ENABLE_SCHEDULER === 'true',
      },
      timezone:
        db.operations?.center.timezone || process.env.CENTER_TIMEZONE || 'America/Los_Angeles',
      observations: staff.role === 'assistant' ? [] : db.observations,
      audit: staff.role === 'owner' ? db.audit : [],
      operations:
        staff.role === 'assistant'
          ? {
              ...db.operations,
              evaluations: [],
              decisions: [],
              achievements: [],
              configHistory: [],
              reports: [],
              processedRequests: [],
            }
          : db.operations,
    });
  } catch (e) {
    return failure(e);
  }
}
