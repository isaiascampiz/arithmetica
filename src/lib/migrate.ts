import { randomUUID } from 'node:crypto';
import { dayKey, type Database, type Student } from './model';
import type { Operations, StudentSettings, Subject } from './v2-model';
export function defaultStudentSettings(s: Student, now = new Date()): StudentSettings {
  const subject = (name: Subject) => ({
    enrolled: s.subjects.includes(name),
    format: 'Paper' as const,
    level: s.level,
    currentStart: 1,
    currentEnd: 10,
    nextStart: 11,
    packetsPerDay: name === 'Math' ? 2 : 1,
    sheetsPerPacket: 10,
    classworkSheets: 10,
    excludeDays: [],
    maxDays: 14,
    maxSheets: 200,
  });
  return {
    version: 1,
    active: true,
    familyId: null,
    recurringDays:
      /^demo-student-\d+$/.test(s.id) && Number(s.id.split('-').at(-1)) % 2 === 0 ? [2, 3] : [1, 4],
    individualSchedule: true,
    expectedMinutes: 45,
    subjects: { Math: subject('Math'), Reading: subject('Reading') },
    updatedAt: now.toISOString(),
  };
}
export function migrateV2(db: Database, now = new Date()): boolean {
  if (db.schemaVersion === 2 || db.schemaVersion === 3) {
    if (!db.operations) throw new Error('V2 operations are missing; refusing to reset records.');
    return false;
  }
  if (db.schemaVersion !== 1) throw new Error('Unsupported schema version.');
  const at = now.toISOString();
  const op: Operations = {
    students: {},
    families: [],
    scheduleEvents: [],
    assistance: [],
    corrections: [],
    classwork: [],
    assignments: [],
    completions: [],
    evaluations: [],
    decisions: [],
    achievements: [],
    appointments: [],
    coverage: [
      {
        id: 'staff-alex',
        name: 'Alex Morgan',
        role: 'instructor',
        days: [1, 2, 3, 4],
        start: '13:00',
        end: '19:15',
      },
      {
        id: 'staff-jamie',
        name: 'Jamie Ellis',
        role: 'instructor',
        days: [1, 2, 3, 4],
        start: '13:00',
        end: '19:15',
      },
      {
        id: 'staff-sam',
        name: 'Sam Reed',
        role: 'grader',
        days: [2, 4],
        start: '14:00',
        end: '18:00',
      },
    ],
    center: {
      name: 'Willow Learning Center',
      timezone: 'America/Los_Angeles',
      operatingDays: [1, 2, 3, 4],
      closedDates: [],
      closingTime: '19:15',
      reportTime: '19:15',
      autoClose: true,
      expectedMinutes: 45,
      earlyPerInstructor: 2,
      jobStartDate: dayKey(now),
    },
    reports: [],
    processedRequests: [],
    configHistory: [],
  };
  for (const s of db.students) {
    op.students[s.id] = defaultStudentSettings(s, now);
    op.configHistory.push({
      studentId: s.id,
      at,
      subjects: structuredClone(op.students[s.id].subjects),
      name: s.name,
      settings: structuredClone(op.students[s.id]),
    });
  }
  // Legacy packets are retained unchanged. Their descriptions are not verified worksheet ledgers.
  db.operations = op;
  db.schemaVersion = 2;
  db.revision++;
  db.audit.push({
    id: randomUUID(),
    action: 'schema-upgrade:1-to-2',
    actor: 'System',
    at,
    entityId: 'schema-v2',
  });
  return true;
}
export function operations(db: Database): Operations {
  if (!db.operations) migrateV2(db);
  return db.operations!;
}
