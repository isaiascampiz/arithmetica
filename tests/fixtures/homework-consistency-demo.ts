import type { Database } from '../../src/lib/model';
import { dayKey } from '../../src/lib/model';
import type { Subject } from '../../src/lib/v2-model';
import type { Packet, SessionRecord } from '../../src/lib/v3-model';
import { addDays } from '../../src/lib/schedule';
import { progressStudentId } from './interactive-progress-student';

export const homeworkDemoMarker = 'fictional-rowan-homework-reviews-v1';
/** Add labeled simulation snapshots only to Rowan's untouched, closed fictional visits. */
export function addFictionalHomeworkReviews(db: Database, now = new Date()) {
  if (db.audit.some((a) => a.id === homeworkDemoMarker)) return 0;
  const op = db.operations!;
  if (
    !op.center.name.startsWith('FICTIONAL') ||
    db.students.find((s) => s.id === progressStudentId)?.name !== 'Fictional Rowan Progress Demo'
  )
    throw Error('The explicitly fictional Rowan student is required.');
  const today = dayKey(now, op.center.timezone);
  const visits = db.visits
    .filter(
      (v) =>
        v.studentId === progressStudentId &&
        v.departedAt &&
        v.departureVerified &&
        !v.sessionRecords?.length &&
        !v.handoff &&
        !v.subjectCheckIns &&
        dayKey(v.arrivedAt, op.center.timezone) >= addDays(today, -365) &&
        dayKey(v.arrivedAt, op.center.timezone) < today,
    )
    .toSorted((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
  const carry: Partial<Record<Subject, Packet>> = {};
  const completed: Record<Subject, Set<string>> = { Math: new Set(), Reading: new Set() };
  let added = 0;
  for (const [index, visit] of visits.entries()) {
    if (Math.floor(index / 2) % 9 === 3) continue; // Explicit gaps, not invented 0% weeks.
    const day = dayKey(visit.arrivedAt, op.center.timezone);
    const at = new Date(Date.parse(visit.arrivedAt) + 60000).toISOString();
    const records: SessionRecord[] = [];
    for (const subject of ['Math', 'Reading'] as Subject[]) {
      const assignments = op.assignments
        .filter(
          (a) =>
            a.studentId === progressStudentId &&
            a.subject === subject &&
            !a.v3 &&
            a.fromDate <= day &&
            a.ranges.length,
        )
        .toSorted((a, b) => a.fromDate.localeCompare(b.fromDate));
      const current = assignments.at(-1);
      if (!current) throw Error('Fictional academic packet sources are required.');
      const packet = (a: typeof current): Packet => ({
        id: homeworkDemoMarker + '-' + a.id,
        sourceAssignmentId: a.id,
        range: structuredClone(a.ranges[0]),
        purpose: 'homework',
        status: 'issued',
        prepared: true,
      });
      const incoming: SessionRecord['incoming'] = [];
      if (carry[subject])
        incoming.push({ packet: structuredClone(carry[subject]!), outcome: 'assumed completed' });
      for (const assignment of assignments.toReversed()) {
        const p = packet(assignment);
        if (incoming.length >= 3) break;
        if (completed[subject].has(p.id) || incoming.some((i) => i.packet.id === p.id)) continue;
        incoming.push({ packet: p, outcome: 'assumed completed' });
      }
      const unfinished =
        index % 17 === 8
          ? 3
          : index < visits.length / 2
            ? [2, 1, 1, 0][(index + (subject === 'Reading' ? 1 : 0)) % 4]
            : [1, 0, 0, 0, 0][(index + (subject === 'Reading' ? 2 : 0)) % 5];
      delete carry[subject];
      incoming.forEach((p, i) => {
        if (i < unfinished) {
          p.outcome = 'unfinished';
          if (!carry[subject]) carry[subject] = structuredClone(p.packet);
        } else completed[subject].add(p.packet.id);
      });
      records.push({
        subject,
        at,
        actor: 'Fictional Demo Instructor',
        format: 'Paper',
        activity: index % 3 === 0 ? 'Both' : 'Worksheets',
        incoming,
        center: {
          ...packet(current),
          id: homeworkDemoMarker + '-center-' + subject + '-' + visit.id,
          purpose: 'in-center',
        },
        outgoing: [],
        reason:
          'Fictional homework review simulation. This example adds no real grading or independent verification.',
      });
    }
    visit.sessionRecords = records;
    visit.subjectCheckIns = Object.fromEntries(
      records.map((r) => [
        r.subject,
        {
          at,
          actor: r.actor,
          activities: { [r.subject]: r.activity },
          assignmentIds: [],
          incoming: r.incoming.some((p) => p.outcome === 'unfinished')
            ? 'exception'
            : 'routine-no-exception',
          events: [],
        },
      ]),
    );
    added++;
  }
  if (!added)
    throw Error(
      'No untouched fictional closed visits are available; no existing reviews will be replaced.',
    );
  db.audit.push({
    id: homeworkDemoMarker,
    actor: 'Fictional demo setup',
    at: now.toISOString(),
    action: 'Added explicitly fictional incoming homework review examples to Rowan',
    entityId: progressStudentId,
  });
  return added;
}
