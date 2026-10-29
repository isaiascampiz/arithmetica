import type { Database } from './model';
import { subjectNeedsSetup } from './student-setup';
import { dayKey, isOpenVisit } from './model';
import type { Assignment, Range, Subject } from './v2-model';
import { addDays, datesBetween, nextExpected } from './schedule';
export function numbers(r: Range) {
  return Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start + i);
}
export function rangesOf(level: string, values: number[]): Range[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const result: Range[] = [];
  for (const n of sorted) {
    const r = result.at(-1);
    if (r && r.end + 1 === n) r.end = n;
    else result.push({ level, start: n, end: n });
  }
  return result;
}
export function rangeLabel(r: Range) {
  return `${r.level} ${r.start}–${r.end}`;
}
export function activeCorrections(db: Database, id?: string, subject?: Subject) {
  return db.operations!.corrections.filter(
    (c) =>
      c.state !== 'complete' && (!id || c.studentId === id) && (!subject || c.subject === subject),
  );
}
export function planHomework(
  db: Database,
  studentId: string,
  subject: Subject,
  fromDate: string,
  carryIds: string[] = [],
  now = new Date(),
): Assignment {
  const op = db.operations!;
  const config = op.students[studentId]?.subjects[subject];
  if (!op.students[studentId]?.active)
    throw new Error('Inactive students cannot receive new homework proposals.');
  if (!config?.enrolled) throw new Error('Subject is not enrolled.');
  if (subjectNeedsSetup(config))
    throw new Error('Complete subject setup before planning homework.');
  const next = nextExpected(op, studentId, fromDate);
  const allDays = next
    ? datesBetween(addDays(fromDate, 1), addDays(next, -1)).filter(
        (d) => !config.excludeDays.includes(new Date(d + 'T12:00:00Z').getUTCDay()),
      )
    : [];
  const rawSheets = allDays.length * config.packetsPerDay * config.sheetsPerPacket;
  const capped = allDays.length > config.maxDays || rawSheets > config.maxSheets;
  const days = allDays.slice(0, config.maxDays);
  let targetSheets = Math.min(
    days.length * config.packetsPerDay * config.sheetsPerPacket,
    config.maxSheets,
  );
  const carried = op.classwork.filter(
    (w) =>
      carryIds.includes(w.id) &&
      w.studentId === studentId &&
      w.subject === subject &&
      !w.carriedAssignmentId,
  );
  if (carried.length !== carryIds.length)
    throw new Error('A carryover packet is already assigned or unavailable.');
  const carryRanges = carried.flatMap((w) =>
    rangesOf(
      w.range.level,
      numbers(w.range).filter((n) => !w.completed.includes(n)),
    ),
  );
  const carrySheets = carryRanges.reduce((n, r) => n + r.end - r.start + 1, 0);
  const reserved = op.assignments.some(
    (a) =>
      a.studentId === studentId &&
      a.subject === subject &&
      a.fromDate !== fromDate &&
      !['deferred', 'verified', 'repeated'].includes(a.status) &&
      a.carryIds.some((id) => carryIds.includes(id)),
  );
  if (reserved)
    throw new Error('This unfinished classwork is reserved in another outgoing assignment.');
  const lastDistribution =
    op.assignments
      .filter((a) => a.studentId === studentId && a.subject === subject)
      .flatMap((a) => a.events)
      .filter((e) => e.status === 'distributed')
      .map((e) => e.at)
      .sort()
      .at(-1) || '';
  const instruction = op.decisions
    .filter(
      (d) =>
        d.studentId === studentId &&
        d.subject === subject &&
        d.approvedAt &&
        !d.supersededAt &&
        d.approvedAt >= lastDistribution,
    )
    .at(-1);
  if (instruction?.kind === 'repeat-range')
    targetSheets = Math.min(
      targetSheets,
      numbers(instruction.range).filter(
        (n) =>
          !carryRanges.some(
            (r) => r.level === instruction.range.level && n >= r.start && n <= r.end,
          ),
      ).length + carrySheets,
    );
  if (carrySheets > targetSheets)
    throw new Error(
      'Carryover exceeds the planned workload. Select a smaller unfinished range or review the homework policy.',
    );
  const newSheets = targetSheets - carrySheets;
  const occupied = new Set(carryRanges.filter((r) => r.level === config.level).flatMap(numbers));
  if (!instruction?.kind.startsWith('repeat'))
    for (const work of op.classwork.filter(
      (w) =>
        w.studentId === studentId &&
        w.subject === subject &&
        !w.carriedAssignmentId &&
        w.range.level === config.level,
    ))
      for (const n of numbers(work.range)) occupied.add(n);
  const requested: number[] = [];
  let cursor = config.nextStart;
  while (requested.length < newSheets) {
    if (!occupied.has(cursor)) requested.push(cursor);
    cursor++;
    if (cursor > 100000) throw new Error('Worksheet range exceeds supported bounds.');
  }
  const ranges = rangesOf(config.level, requested);
  const blocked: string[] = [];
  if (!next) blocked.push('No next attendance date configured');
  if (activeCorrections(db, studentId, subject).some((c) => c.state !== 'deferred'))
    blocked.push('Corrections must be completed or explicitly deferred');
  if (
    op.decisions.some(
      (d) => d.studentId === studentId && d.subject === subject && !d.approvedAt && !d.supersededAt,
    )
  )
    blocked.push('Instructor assignment decision pending');
  const fingerprint = JSON.stringify({
    config,
    next,
    days,
    targetSheets,
    ranges,
    carryRanges,
    blocked,
  });
  return {
    id: crypto.randomUUID(),
    studentId,
    subject,
    format: config.format,
    fromDate,
    nextVisit: next,
    homeworkDays: allDays,
    ranges,
    carryRanges,
    carryIds,
    targetPackets: Math.ceil(targetSheets / config.sheetsPerPacket),
    targetSheets,
    newPackets: Math.ceil(newSheets / config.sheetsPerPacket),
    newSheets,
    status: next ? 'proposed' : 'decision-needed',
    blocked,
    capped,
    stale: false,
    fingerprint,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    events: [],
  };
}
export function refreshProposals(db: Database, now = new Date()) {
  const op = db.operations!;
  for (const a of op.assignments.filter(
    (a) =>
      ![
        'distributed',
        'returned',
        'partial',
        'verified',
        'corrections-outstanding',
        'repeated',
        'deferred',
      ].includes(a.status),
  )) {
    let proposed: Assignment;
    try {
      proposed = planHomework(db, a.studentId, a.subject, a.fromDate, a.carryIds, now);
    } catch {
      a.stale = true;
      continue;
    }
    if (proposed.fingerprint === a.fingerprint) continue;
    if (a.status === 'proposed' || a.status === 'decision-needed') {
      Object.assign(a, {
        ...proposed,
        id: a.id,
        createdAt: a.createdAt,
        events: [
          ...a.events,
          {
            at: now.toISOString(),
            actor: 'System',
            status: proposed.status,
            reason: 'Recalculated after schedule, correction, or subject change',
            snapshot: assignmentSnapshot(proposed),
          },
        ],
      });
    } else a.stale = true;
  }
}
export function planningDate(db: Database, id: string, now = new Date()) {
  const op = db.operations!;
  return db.visits
    .filter((v) => v.studentId === id)
    .sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt))[0]?.arrivedAt
    ? dayKey(
        db.visits
          .filter((v) => v.studentId === id)
          .sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt))[0].arrivedAt,
        op.center.timezone,
      )
    : dayKey(now, op.center.timezone);
}
export function assignmentSnapshot(a: Assignment) {
  return structuredClone({
    ranges: a.ranges,
    carryRanges: a.carryRanges,
    targetSheets: a.targetSheets,
    newSheets: a.newSheets,
    nextVisit: a.nextVisit,
  });
}
export function correctionVisits(db: Database, createdAt: string, id: string) {
  return db.visits.filter((v) => v.studentId === id && v.arrivedAt >= createdAt).length;
}
export function workflowStep(db: Database, id: string) {
  if (activeCorrections(db, id).length) return 'Corrections first';
  if (
    db.operations!.classwork.some(
      (w) =>
        w.studentId === id &&
        !w.carriedAssignmentId &&
        w.completed.length < numbers(w.range).length,
    )
  )
    return 'Classwork';
  if (db.operations!.assignments.some((a) => a.studentId === id && a.status === 'pulled'))
    return 'Ready for handoff';
  return db.visits.some((v) => v.studentId === id && isOpenVisit(v))
    ? 'Classwork / observation'
    : 'Next visit preparation';
}
