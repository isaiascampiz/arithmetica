import type { Database, Student, Visit } from './model';
import { dayKey, isOpenVisit } from './model';
import type { Assignment, Range, Subject } from './v2-model';
import type { Activity, Packet } from './v3-model';
import { addDays, datesBetween, expectedOn, nextExpected, recurring } from './schedule';

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
  explicitPosition = false,
  includeCenter = true,
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
    !explicitPosition &&
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
  const ranges = Array.from({ length: Math.min(count + (includeCenter ? 1 : 0), 101) }, (_, i) => ({
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
  const inCenter = valid && includeCenter ? make(ranges[0], 0) : null,
    planned = valid ? ranges.slice(includeCenter ? 1 : 0).map((r, i) => make(r, i + 1)) : [];
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
      advanceCursor: { level: s.level, start: start + (count + (includeCenter ? 1 : 0)) * size },
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
      if (open && !open.handoff && open.subjectCheckIns?.[subject]) continue;
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
          (a.v3.temporaryPaper ||
            (db.operations!.students[visit.studentId].subjects[a.subject].enrolled &&
              db.operations!.students[visit.studentId].subjects[a.subject].format === 'Paper')) &&
          a.v3.visitDate === dayKey(visit.arrivedAt, db.operations!.center.timezone))),
  );
}
export function incomingPackets(
  db: Database,
  studentId: string,
  subject: Subject,
  excludeAssignmentId?: string,
) {
  return db
    .operations!.assignments.filter(
      (a) =>
        a.id !== excludeAssignmentId &&
        a.studentId === studentId &&
        a.subject === subject &&
        a.v3?.issuedAt,
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

/** Subject review shares physical packet identities with preparation; no completion is inferred. */
export function subjectPlan(
  db: Database,
  set: Assignment,
  activity: Activity,
  returned: Packet[] = [],
  outgoingSlots = set.v3!.issuedAt ? set.v3!.issued.length : set.v3!.planned.length,
) {
  const v = set.v3!,
    review = [...v.review];
  const available = [
    ...new Map(returned.filter((p) => p.status === 'unfinished').map((p) => [p.id, p])).values(),
  ];
  for (const p of available) {
    const error = validateRange(db, set.subject, p.range);
    if (error) review.push(error);
  }
  const order = (p: Packet) =>
    db.operations!.v3!.catalog.find((c) => c.subject === set.subject && c.id === p.range.level)
      ?.order ?? Infinity;
  available.sort(
    (a, b) =>
      order(a) - order(b) ||
      a.range.start - b.range.start ||
      a.range.end - b.range.end ||
      a.id.localeCompare(b.id),
  );
  const materials = [
    ...(v.inCenter ? [v.inCenter] : []),
    ...(v.issuedAt ? [...v.issued, ...v.held] : v.planned),
  ];
  const queue = [...new Map([...available, ...materials].map((p) => [p.id, p])).values()];
  const center = activity === 'Corrections only' ? null : queue.shift() || null;
  const out = queue.slice(0, outgoingSlots).map((p) => ({ ...p, purpose: 'homework' as const }));
  const used = new Set([...(center ? [center.id] : []), ...out.map((p) => p.id)]);
  if (available.some((p) => !used.has(p.id)))
    review.push(
      'More unfinished packets than scheduled homework slots. Use Adjust to include the remaining packets.',
    );
  const held = materials.filter((p) => !used.has(p.id));
  return {
    center: center ? { ...center, purpose: 'in-center' as const } : null,
    out,
    held,
    review: [...new Set(review)],
  };
}
/** Rebuild by exact ranges, reusing physical identities rather than inserting an old queue. */
export function reuseSequence(
  db: Database,
  set: Assignment,
  center: Packet | null,
  out: Packet[],
  returned: Packet[] = [],
) {
  const v = set.v3!;
  const local = [
    ...returned,
    ...(v.inCenter ? [v.inCenter] : []),
    ...v.issued,
    ...v.planned,
    ...v.held,
  ];
  const pool = [
    ...local,
    ...db
      .operations!.assignments.filter(
        (a) =>
          a.id !== set.id && a.studentId === set.studentId && a.subject === set.subject && a.v3,
      )
      .flatMap((a) => a.v3!.held),
  ];
  const used = new Set<string>(),
    seen = new Set<string>(),
    review: string[] = [];
  const take = (p: Packet): Packet => {
    const error = validateRange(db, set.subject, p.range);
    if (error) review.push(error);
    for (let n = p.range.start; n <= Math.min(p.range.end, p.range.start + 10000); n++) {
      const key = p.range.level + ':' + n;
      if (seen.has(key))
        review.push('A worksheet cannot appear in more than one packet in this plan.');
      seen.add(key);
    }
    const match = pool.find(
      (q) =>
        !used.has(q.id) &&
        q.status !== 'missing' &&
        q.range.level === p.range.level &&
        q.range.start === p.range.start &&
        q.range.end === p.range.end &&
        !db.operations!.assignments.some(
          (a) =>
            a.id !== set.id &&
            a.v3?.issued.some(
              (r) => r.id === q.id && ['issued', 'unfinished', 'missing'].includes(r.status),
            ) &&
            !returned.some((r) => r.id === q.id),
        ) &&
        !db.operations!.assignments.some(
          (a) =>
            a.id !== set.id &&
            a.v3 &&
            !a.v3.issuedAt &&
            (a.v3.inCenter?.id === q.id || a.v3.planned.some((r) => r.id === q.id)),
        ),
    );
    const result = match || {
      ...p,
      ...(pool.some((q) => q.id === p.id)
        ? { id: `${set.id}:adjust:${p.range.level}:${p.range.start}:${p.range.end}` }
        : {}),
      sourceAssignmentId: set.id,
    };
    if (
      !match &&
      !pool.some((q) => q.id === p.id) &&
      db.operations!.assignments.some(
        (a) =>
          a.v3 &&
          [a.v3.inCenter, ...a.v3.planned, ...a.v3.issued, ...a.v3.held].some(
            (q) => q?.id === p.id,
          ),
      )
    )
      review.push('Packet identity belongs to another assignment. Reopen Quick View.');
    if (used.has(result.id)) review.push('A physical packet cannot be used twice in this plan.');
    used.add(result.id);
    return { ...result, purpose: p.purpose, status: 'planned' };
  };
  const inCenter = center ? take({ ...center, purpose: 'in-center' }) : null;
  const outgoing = out.map((p) => take({ ...p, purpose: 'homework' }));
  return {
    center: inCenter,
    out: outgoing,
    held: [...new Map(local.filter((p) => !used.has(p.id)).map((p) => [p.id, p])).values()],
    review: [...new Set(review)],
  };
}

export type RepeatSequence = {
  level: string;
  start: number;
  packetsPerDay: number;
  sheetsPerPacket: number;
  startWith: 'today' | 'homework';
};
export function repeatSequence(
  db: Database,
  set: Assignment,
  plan: RepeatSequence,
  activity: Activity,
  currentCenter: Packet | null,
  returned: Packet[] = [],
) {
  const copy = structuredClone(db);
  Object.assign(copy.operations!.students[set.studentId].subjects[set.subject], {
    level: plan.level,
    nextStart: plan.start,
    packetsPerDay: plan.packetsPerDay,
    sheetsPerPacket: plan.sheetsPerPacket,
  });
  const today = plan.startWith === 'today' && activity !== 'Corrections only';
  const proposal = paperProposal(
    copy,
    set.studentId,
    set.subject,
    set.v3!.visitDate,
    set.id + ':repeat:' + set.v3!.version,
    true,
    today,
  );
  if (!proposal) return null;
  const startError = validateRange(db, set.subject, {
    level: plan.level,
    start: plan.start,
    end: plan.start,
  });
  if (startError) proposal.v3!.review.push(startError);
  const resolved = reuseSequence(
    db,
    set,
    today ? proposal.v3!.inCenter : activity === 'Corrections only' ? null : currentCenter,
    proposal.v3!.planned,
    returned,
  );
  proposal.v3!.inCenter = resolved.center;
  proposal.v3!.planned = resolved.out;
  proposal.v3!.review = [...new Set([...proposal.v3!.review, ...resolved.review])];
  if (
    !Number.isInteger(plan.start) ||
    plan.start < 1 ||
    !Number.isInteger(plan.packetsPerDay) ||
    plan.packetsPerDay < 0 ||
    plan.packetsPerDay > 10 ||
    !Number.isInteger(plan.sheetsPerPacket) ||
    plan.sheetsPerPacket < 1 ||
    plan.sheetsPerPacket > 100
  )
    proposal.v3!.review.push('Enter valid whole-number packet quantities and starting page.');
  return proposal;
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

export type HomeFilter = 'expected' | 'here' | 'early' | 'out';
export type HomeRow = { student: Student; visit: Visit | null };
export function homeRoster(db: Database, today: string, filter: HomeFilter | null = null) {
  const tz = db.operations!.center.timezone,
    students = new Map(db.students.map((s) => [s.id, s])),
    visits = dailyRoster(db, today),
    present = visits.filter(isOpenVisit),
    arrived = new Set(
      db.visits
        .filter((v) => dayKey(v.arrivedAt, tz) === today || isOpenVisit(v))
        .map((v) => v.studentId),
    ),
    expected: HomeRow[] = db.students
      .filter((s) => expectedOn(db.operations!, s.id, today) && !arrived.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((student) => ({ student, visit: null })),
    checkedOut = db.visits
      .filter(
        (v) => v.departedAt && v.departureVerified === true && dayKey(v.departedAt, tz) === today,
      )
      .sort((a, b) => b.departedAt!.localeCompare(a.departedAt!)),
    departed = [
      ...new Map(
        [...visits.filter((v) => !isOpenVisit(v)), ...checkedOut].map((v) => [v.id, v]),
      ).values(),
    ].sort((a, b) =>
      (b.departedAt || b.closedAt || b.arrivedAt).localeCompare(
        a.departedAt || a.closedAt || a.arrivedAt,
      ),
    ),
    rows = (items: Visit[]): HomeRow[] =>
      items.map((visit) => ({ student: students.get(visit.studentId)!, visit })),
    here = rows(present),
    early = here.filter((r) => r.student.earlyLearner),
    out = rows(checkedOut),
    groups = { expected, here, early, out };
  return {
    rows: filter ? groups[filter] : [...here, ...expected, ...rows(departed)],
    counts: { expected: expected.length, here: here.length, early: early.length, out: out.length },
  };
}
