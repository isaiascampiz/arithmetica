import type { Database, Visit } from './model';
import { dayKey, isOpenVisit } from './model';
import type { Assignment, Range, Subject } from './v2-model';
import type { Activity, Packet } from './v3-model';
import { addDays, datesBetween, nextExpected, recurring } from './schedule';

export const packetLabel = (p: Packet | Range) => {
  const r = 'range' in p ? p.range : p;
  return `${r.level}${r.start}–${r.end}`;
};
export function validateRange(db: Database, subject: Subject, r: Range): string | null {
  const level = db.operations?.v3?.catalog.find((c) => c.subject === subject && c.id === r.level);
  if (!level?.approved || level.last === null)
    return `Instructor review: ${subject} ${r.level} has no approved worksheet boundary.`;
  if (
    !Number.isInteger(r.start) ||
    !Number.isInteger(r.end) ||
    r.start < level.first ||
    r.end < r.start ||
    r.end > level.last
  )
    return `Assessment / instructor review: ${subject} ${r.level} valid range is ${level.first}–${level.last}; advancement needs approval.`;
  return null;
}
export function paperProposal(
  db: Database,
  studentId: string,
  subject: Subject,
  visitDate: string,
  id: string,
): Assignment | null {
  const op = db.operations!,
    cfg = op.students[studentId],
    s = cfg.subjects[subject];
  if (
    !cfg.active ||
    (cfg.awayUntil && visitDate < cfg.awayUntil) ||
    !s.enrolled ||
    s.format !== 'Paper'
  )
    return null;
  // An absence is a pause, never an extended vacation assignment. Before a
  // pause, use the ordinary recurrence; resume from the actual return visit.
  const routine = { ...op, students: { ...op.students, [studentId]: { ...cfg, awayUntil: null } } };
  const next = nextExpected(routine, studentId, visitDate);
  const days = next ? datesBetween(addDays(visitDate, 1), addDays(next, -1)) : [];
  const count = days.length * s.packetsPerDay;
  const review: string[] = [];
  if (!next) review.push('Choose regular Monday–Thursday visit days before planning.');
  if (count > 100)
    review.push('Instructor review: more than 100 outgoing packets; adjust permanent settings.');
  const previous = op.assignments
    .filter(
      (a) =>
        !a.v3 &&
        a.studentId === studentId &&
        a.subject === subject &&
        a.format === 'Paper' &&
        ['distributed', 'returned', 'partial', 'verified', 'corrections-outstanding'].includes(
          a.status,
        ),
    )
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .at(-1);
  const explicitLater =
    previous &&
    op.decisions.some(
      (d) =>
        d.studentId === studentId &&
        d.subject === subject &&
        d.approvedAt &&
        d.approvedAt >= previous.updatedAt,
    );
  const priorEnd =
    previous &&
    !explicitLater &&
    !op.assignments.some(
      (a) => a.v3?.issuedAt && a.studentId === studentId && a.subject === subject,
    )
      ? Math.max(
          s.nextStart,
          ...[...previous.ranges, ...previous.carryRanges]
            .filter((r) => r.level === s.level)
            .map((r) => r.end + 1),
        )
      : s.nextStart;
  const start = priorEnd,
    size = s.sheetsPerPacket;
  const ranges = Array.from({ length: Math.min(count + 1, 101) }, (_, i) => ({
    level: s.level,
    start: start + i * size,
    end: start + (i + 1) * size - 1,
  }));
  for (const r of ranges) {
    const error = validateRange(db, subject, r);
    if (error && !review.includes(error)) review.push(error);
  }
  const at = new Date().toISOString();
  const make = (range: Range, index: number): Packet => {
    const held = op.assignments
      .filter((a) => a.studentId === studentId && a.subject === subject && a.v3)
      .flatMap((a) => a.v3!.held)
      .find(
        (p) =>
          p.status === 'held' &&
          p.range.level === range.level &&
          p.range.start === range.start &&
          p.range.end === range.end &&
          !op.assignments.some(
            (a) =>
              a.id !== id &&
              a.v3 &&
              !a.v3.issuedAt &&
              (a.v3.inCenter?.id === p.id || a.v3.planned.some((q) => q.id === p.id)),
          ),
      );
    if (held)
      return { ...held, purpose: index === 0 ? 'in-center' : 'homework', status: 'planned' };
    return {
      id: `${id}:packet:${index}`,
      range,
      sourceAssignmentId: id,
      purpose: index === 0 ? 'in-center' : 'homework',
      prepared: false,
      status: 'planned',
    };
  };
  // Never publish even a partial invalid range as a physical pulling task.
  const valid = review.length === 0;
  const inCenter = valid ? make(ranges[0], 0) : null,
    planned = valid ? ranges.slice(1).map((r, i) => make(r, i + 1)) : [];
  return {
    id,
    studentId,
    subject,
    format: 'Paper',
    fromDate: visitDate,
    nextVisit: next,
    homeworkDays: days,
    ranges: planned.map((p) => p.range),
    carryRanges: [],
    carryIds: [],
    targetPackets: count,
    targetSheets: count * size,
    newPackets: count,
    newSheets: count * size,
    status: valid ? 'proposed' : 'decision-needed',
    blocked: review,
    capped: false,
    stale: false,
    fingerprint: JSON.stringify([
      s,
      visitDate,
      next,
      recurring(op, cfg),
      op.v3!.catalog.find((l) => l.subject === subject && l.id === s.level),
    ]),
    createdAt: at,
    updatedAt: at,
    events: [],
    v3: {
      visitDate,
      inCenter,
      planned,
      issued: [],
      held: [],
      version: 1,
      review,
      adjustment: [],
      originalCursor: { level: s.level, start },
      advanceCursor: { level: s.level, start: start + (count + 1) * size },
      preparedAt: null,
      preparedBy: null,
      issuedAt: null,
      visitId: null,
      reconciliations: [],
    },
  };
}
export function synchronizePreparation(
  db: Database,
  today = dayKey(new Date(), db.operations!.center.timezone),
) {
  const op = db.operations!;
  if (!op.v3) return;
  for (const student of db.students) {
    const c = op.students[student.id];
    if (!c.active || (c.awayUntil && today < c.awayUntil)) continue;
    const open = db.visits.find((v) => v.studentId === student.id && isOpenVisit(v));
    const visitDate =
      open && !open.handoff
        ? dayKey(open.arrivedAt, op.center.timezone)
        : nextExpected(
            op,
            student.id,
            today,
            !db.visits.some(
              (v) =>
                v.studentId === student.id && dayKey(v.arrivedAt, op.center.timezone) === today,
            ),
          );
    if (!visitDate) continue;
    for (const subject of ['Math', 'Reading'] as Subject[]) {
      const cfg = c.subjects[subject];
      if (!cfg.enrolled || cfg.format !== 'Paper') continue;
      const existing = op.assignments.find(
        (a) => a.v3 && a.studentId === student.id && a.subject === subject && !a.v3.issuedAt,
      );
      const proposal = paperProposal(
        db,
        student.id,
        subject,
        visitDate,
        existing?.id || crypto.randomUUID(),
      );
      if (!proposal) continue;
      if (!existing) {
        op.assignments.push(proposal);
        continue;
      }
      if (existing.fingerprint === proposal.fingerprint) continue;
      if (existing.v3!.preparedAt) {
        existing.v3!.visitDate = visitDate;
        existing.v3!.adjustment = [
          'Settings changed: compare displayed physical packets with the new plan; explicitly reprepare.',
        ];
        existing.stale = true;
        continue;
      }
      proposal.events = existing.events;
      proposal.createdAt = existing.createdAt;
      proposal.v3!.version = existing.v3!.version + 1;
      Object.assign(existing, proposal);
    }
  }
}
export function currentSets(db: Database, visit: Visit) {
  return db.operations!.assignments.filter(
    (a) =>
      a.v3 &&
      a.studentId === visit.studentId &&
      (a.v3.visitId === visit.id ||
        (!a.v3.issuedAt &&
          (a.v3.temporaryPaper || db.operations!.students[visit.studentId].subjects[a.subject].enrolled&&db.operations!.students[visit.studentId].subjects[a.subject].format==='Paper') &&
          a.v3.visitDate === dayKey(visit.arrivedAt, db.operations!.center.timezone))),
  );
}
export function incomingPackets(db: Database, studentId: string, subject: Subject) {
  return db
    .operations!.assignments.filter(
      (a) => a.studentId === studentId && a.subject === subject && a.v3?.issuedAt,
    )
    .flatMap((a) =>
      a.v3!.issued.filter((p) => !['finished', 'held', 'routine'].includes(p.status)),
    );
}
export function recommend(set: Assignment, activity: Activity, returned: Packet[] = []) {
  const v = set.v3!,
    out = [...v.planned],
    held: Packet[] = [],
    review = [...v.review],
    messages: string[] = [];
  const available = returned.filter((p) => p.status === 'unfinished');
  const replace = (p: Packet) => {
    if (!out.length) {
      review.push('No outgoing homework slots. Adjust the assignment explicitly.');
      return;
    }
    const displaced = out.pop()!;
    held.push({ ...displaced, status: 'held' });
    out.unshift({ ...p, purpose: 'homework', status: 'planned' });
  };
  // Maintain physical availability. A missing packet can never enter this list.
  for (const p of [...available].reverse()) {
    if (available.length > v.planned.length) {
      review.push(
        'Returned unfinished packets exceed available slots. Choose a manual assignment.',
      );
      break;
    }
    replace(p);
  }
  if (activity === 'Corrections only' && v.inCenter) {
    if (available.length >= v.planned.length && available.length) {
      review.push(
        'Corrections-only shift conflicts with returned unfinished packets. Adjust manually.',
      );
    } else replace(v.inCenter);
  }
  if (held.length)
    messages.push(
      `Send ${out.map(packetLabel).join(', ')}; keep ${held.map(packetLabel).join(', ')} at center.`,
    );
  return { out, held, review: [...new Set(review)], messages };
}
export function dailyRoster(db: Database, today: string) {
  return db.visits
    .filter((v) => dayKey(v.arrivedAt, db.operations!.center.timezone) === today || isOpenVisit(v))
    .sort((a, b) => {
      const rank = (v: Visit) => (isOpenVisit(v) ? (v.handoff ? 1 : 0) : 2);
      const d = rank(a) - rank(b);
      if (d) return d;
      return rank(a) === 0
        ? a.arrivedAt.localeCompare(b.arrivedAt)
        : rank(a) === 1
          ? b.arrivedAt.localeCompare(a.arrivedAt)
          : (b.departedAt || b.closedAt || b.arrivedAt).localeCompare(
              a.departedAt || a.closedAt || a.arrivedAt,
            );
    });
}
