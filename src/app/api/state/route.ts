import { staffSession } from '@/lib/auth';
import { repository } from '@/lib/repository';
import { failure, json } from '@/lib/http';
import { synchronizePreparation } from '@/lib/v3-planning';
import { runDueJobs } from '@/lib/reports';
import { staffProfile } from '@/lib/staff-profile';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const staff = await staffSession();
    const db = await repository.transaction((db) => {
      if (db.schemaVersion === 3) runDueJobs(db);
      synchronizePreparation(db);
      return db;
    });
    const ownProfile = staffProfile(db, staff);
    // Only the signed-in person's display profile may accompany a staff snapshot.
    if (db.operations?.v3) {
      delete db.operations.v3.staffProfiles;
      delete db.operations.v3.accountRequests;
      delete db.operations.v3.receptionReceipts;
    }
    return json({
      ...db,
      staff: {
        ...staff,
        displayName: [ownProfile.firstName, ownProfile.lastName].filter(Boolean).join(' '),
        picture: ownProfile.picture,
      },
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
