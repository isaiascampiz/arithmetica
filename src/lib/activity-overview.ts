import { dayKey, isOpenVisit, type Database } from './model';
import { expectedOn } from './schedule';
import { attendancePunches, type Punch } from './center-arrivals';
import { matchVisit } from './v3-analytics';

export function activityOverview(db: Database, now = new Date()) {
  const today = dayKey(now, db.operations!.center.timezone);
  const visits = [...new Map(db.visits.map((v) => [v.id, v])).values()].filter(
    (v) => Date.parse(v.arrivedAt) <= now.getTime(),
  );
  const arrived = new Set(
    visits
      .filter((v) => dayKey(v.arrivedAt, db.operations!.center.timezone) === today)
      .map((v) => v.studentId),
  );
  const here = new Set(
    visits
      .filter(
        (v) => isOpenVisit(v) && dayKey(v.arrivedAt, db.operations!.center.timezone) === today,
      )
      .map((v) => v.studentId),
  );
  return {
    here: here.size,
    arrived: arrived.size,
    remaining: db.students.filter(
      (s) => expectedOn(db.operations!, s.id, today) && !arrived.has(s.id),
    ).length,
    unresolved: visits.filter(
      (v) => isOpenVisit(v) && dayKey(v.arrivedAt, db.operations!.center.timezone) < today,
    ).length,
  };
}

export type ActivityRecord = Omit<Punch, 'kind' | 'visitId'> & {
  kind: string;
  visitId: string | null;
};
export function activityTimeline(db: Database, now = new Date()): ActivityRecord[] {
  const rows: ActivityRecord[] = attendancePunches(db, now);
  for (const v of db.visits) {
    for (const [index, record] of (v.sessionRecords || []).entries()) {
      if (Date.parse(record.at) > now.getTime()) continue;
      rows.push({
        id: `${v.id}:session:${index}`,
        visitId: v.id,
        studentId: v.studentId,
        at: record.at,
        kind: `${record.subject} instructor check-in`,
        actor: record.actor,
        reason: record.activity,
        events: [],
      });
    }
  }
  for (const note of db.observations) {
    if (Date.parse(note.createdAt) > now.getTime()) continue;
    rows.push({
      id: `note:${note.id}`,
      visitId: matchVisit(db, note.studentId, note.createdAt, note.visitId)?.id || null,
      studentId: note.studentId,
      at: note.createdAt,
      kind: 'Observation',
      actor: note.author,
      reason: [note.choices.join(', '), note.text].filter(Boolean).join(' · '),
      events: [],
    });
  }
  return rows.sort(
    (a, b) => a.at.localeCompare(b.at) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
  );
}
