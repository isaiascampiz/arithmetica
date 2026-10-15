import { dayKey, isOpenVisit, type Database } from './model';
import { addDays, datesBetween, expectedOn, nextOperating, weekday, localClock } from './schedule';
import { rangeLabel } from './homework';
import type { Appointment, Report, ReportPayload, Subject } from './v2-model';
export function staffingWarnings(db: Database, appointment: Appointment) {
  const op = db.operations!,
    date = dayKey(appointment.startsAt, op.center.timezone),
    start = new Date(appointment.startsAt).getTime(),
    end = start + appointment.minutes * 60000;
  const warnings: string[] = [];
  const owner = op.coverage.find((c) => c.id === appointment.staffId);
  const clock = localClock(new Date(start), op.center.timezone);
  const endClock = localClock(new Date(end), op.center.timezone);
  if (!owner || !owner.days.includes(weekday(date)) || clock < owner.start || endClock > owner.end)
    warnings.push('Assigned instructor is outside configured coverage');
  if (
    op.appointments.some(
      (a) =>
        a.id !== appointment.id &&
        a.status === 'scheduled' &&
        a.staffId === appointment.staffId &&
        Date.parse(a.startsAt) < end &&
        Date.parse(a.startsAt) + a.minutes * 60000 > start,
    )
  )
    warnings.push('Instructor has overlapping orientations');
  const scheduledEarly = db.students.filter(
    (s) => s.earlyLearner && expectedOn(op, s.id, date),
  ).length;
  const instructors = op.coverage.filter(
    (c) =>
      c.role === 'instructor' &&
      c.days.includes(weekday(date)) &&
      c.start <= clock &&
      c.end >= endClock,
  );
  const occupied = new Set(
    op.appointments
      .filter(
        (a) =>
          a.status === 'scheduled' &&
          Date.parse(a.startsAt) < end &&
          Date.parse(a.startsAt) + a.minutes * 60000 > start,
      )
      .map((a) => a.staffId),
  );
  occupied.add(appointment.staffId);
  const available = instructors.filter((c) => !occupied.has(c.id)).length;
  if (scheduledEarly > available * op.center.earlyPerInstructor)
    warnings.push(
      `${scheduledEarly} expected early learners; ${available} instructors available during orientation (planning estimate, arrivals are flexible)`,
    );
  return warnings;
}
export function reportBounds(kind: Report['kind'], period: string) {
  if (kind === 'daily') return { start: period, end: period };
  if (kind === 'monthly') {
    const start = period.slice(0, 7) + '-01';
    const end = addDays(
      new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 1))
        .toISOString()
        .slice(0, 10),
      -1,
    );
    return { start, end };
  }
  const d = weekday(period);
  return { start: addDays(period, -((d + 6) % 7)), end: addDays(period, 6 - ((d + 6) % 7)) };
}
export function buildReport(db: Database, kind: Report['kind'], period: string): ReportPayload {
  const op = db.operations!,
    { start, end } = reportBounds(kind, period),
    tz = op.center.timezone;
  const inPeriod = (stamp: string) => dayKey(stamp, tz) >= start && dayKey(stamp, tz) <= end;
  const visits = db.visits.filter((v) => inPeriod(v.arrivedAt));
  const notes = db.observations.filter((o) => dayKey(o.createdAt, tz) <= end);
  const completions = op.completions.filter((c) => {
    const d = c.completedDate || dayKey(c.at, tz);
    return c.active && d >= start && d <= end;
  });
  const assignments = op.assignments.filter((a) => a.fromDate <= end);
  const statuses: Record<string, number> = {};
  for (const a of assignments) {
    const e = a.events.filter((e) => dayKey(e.at, tz) <= end).at(-1);
    if (e) statuses[e.status] = (statuses[e.status] || 0) + 1;
  }
  const next = nextOperating(op, end);
  const corrections = op.corrections.filter(
    (c) =>
      dayKey(c.createdAt, tz) <= end &&
      (c.events.filter((e) => dayKey(e.at, tz) <= end).at(-1)?.state || c.state) !== 'complete',
  );
  const activeNotes = notes.filter((o) => !o.reviewedAt || dayKey(o.reviewedAt, tz) > end);
  const upcoming = op.appointments.filter(
    (a) =>
      a.status === 'scheduled' &&
      dayKey(a.startsAt, tz) > end &&
      dayKey(a.startsAt, tz) <= addDays(end, 7),
  );
  const missing: string[] = [];
  if (visits.some(isOpenVisit)) missing.push('Open visits awaiting departure confirmation');
  if (completions.some((c) => c.officialCount === null))
    missing.push('Verified physical completions missing official reportable counts');
  if (assignments.some((a) => a.stale))
    missing.push('Assignments changed after approval/pull and require reconciliation');
  if (db.homework.length)
    missing.push(
      'V1 homework packets are retained as legacy descriptions, without verified worksheet identities/counts',
    );
  if (
    !op.v3 &&
    op.classwork.some(
      (w) => !w.carriedAssignmentId && w.completed.length < w.range.end - w.range.start + 1,
    )
  )
    missing.push('Unfinished classwork remains to review');
  return {
    visits: visits.length,
    students: new Set(visits.map((v) => v.studentId)).size,
    verifiedDepartures: visits.filter((v) => v.departedAt && v.departureVerified !== false).length,
    unverifiedDepartures: visits.filter((v) => v.closedAt && !v.departureVerified).map((v) => v.id),
    followUps: [...new Set(activeNotes.filter((o) => o.followUp).map((o) => o.studentId))],
    pendingObservations: activeNotes.length,
    corrections: corrections.length,
    assignmentStatuses: statuses,
    physicalSheets: completions.reduce((n, c) => n + c.physicalSheets, 0),
    officialSheets: completions.reduce((n, c) => n + (c.officialCount ?? 0), 0),
    unreportableCompletions: completions.filter((c) => c.officialCount === null).length,
    nextDay: next,
    expectedNext: next
      ? db.students.filter((s) => expectedOn(op, s.id, next)).map((s) => s.id)
      : [],
    preparation: op.assignments
      .filter(
        (a) =>
          a.format === 'Paper' &&
          ['proposed', 'approved', 'ready'].includes(a.status) &&
          (!next || a.nextVisit === next),
      )
      .map((a) => a.id),
    appointments: upcoming.map((a) => a.id),
    staffingWarnings: upcoming.flatMap((a) =>
      staffingWarnings(db, a).map((w) => `${a.title}: ${w}`),
    ),
    missing,
    studentSummaries: db.students.flatMap((s) =>
      (['Math', 'Reading'] as Subject[])
        .filter(
          (sub) =>
            op.students[s.id].subjects[sub].enrolled ||
            completions.some((c) => c.studentId === s.id && c.subject === sub),
        )
        .map((sub) => {
          const cfg = op.configHistory
            .filter((h) => h.studentId === s.id && dayKey(h.at, tz) <= end)
            .at(-1)?.subjects[sub];
          const completed = completions.filter((c) => c.studentId === s.id && c.subject === sub);
          const lastCompletion = [...completed]
            .sort((a, b) =>
              (a.completedDate || dayKey(a.at, tz)).localeCompare(
                b.completedDate || dayKey(b.at, tz),
              ),
            )
            .at(-1);
          const work = assignments.filter(
            (a) => a.studentId === s.id && a.subject === sub && a.fromDate >= start,
          );
          return {
            id: s.id,
            name: s.name,
            subject: sub,
            level: cfg?.level || lastCompletion?.level || 'Not recorded',
            range: cfg
              ? rangeLabel({ level: cfg.level, start: cfg.currentStart, end: cfg.currentEnd })
              : lastCompletion
                ? `${lastCompletion.level} verified sheets ${lastCompletion.worksheets.join(', ')}`
                : 'Not recorded',
            attendance: visits.filter((v) => v.studentId === s.id).length,
            physicalSheets: completed.reduce((n, c) => n + c.physicalSheets, 0),
            officialSheets: completed.reduce((n, c) => n + (c.officialCount ?? 0), 0),
            repeats: op.decisions.filter(
              (d) =>
                d.studentId === s.id &&
                d.subject === sub &&
                d.approvedAt &&
                inPeriod(d.approvedAt) &&
                d.kind.startsWith('repeat'),
            ).length,
            observations: notes.filter((o) => o.studentId === s.id && inPeriod(o.createdAt)).length,
            distributed: work.filter((a) =>
              a.events.some((e) => e.status === 'distributed' && inPeriod(e.at)),
            ).length,
            returned: work.filter((a) =>
              a.events.some(
                (e) => ['returned', 'partial', 'verified'].includes(e.status) && inPeriod(e.at),
              ),
            ).length,
          };
        }),
    ),
  };
}
export function archiveReport(
  db: Database,
  kind: Report['kind'],
  period: string,
  now = new Date(),
  reason = 'Scheduled report',
  newVersion = false,
) {
  const op = db.operations!;
  const key =
    kind === 'monthly'
      ? period.slice(0, 7)
      : kind === 'weekly'
        ? reportBounds(kind, period).start
        : period;
  const previous = op.reports.filter((r) => r.kind === kind && r.period === key);
  if (previous.length && !newVersion) return previous.at(-1)!;
  const report: Report = {
    id: crypto.randomUUID(),
    kind,
    period: key,
    version: (previous.at(-1)?.version || 0) + 1,
    generatedAt: now.toISOString(),
    sourceRevision: db.revision,
    payload: buildReport(db, kind, key),
    reason,
  };
  op.reports.push(report);
  db.audit.push({
    id: crypto.randomUUID(),
    action: `report:${kind}:v${report.version}`,
    actor: 'Report worker',
    at: now.toISOString(),
    entityId: report.id,
  });
  return report;
}
export function runDueJobs(db: Database, now = new Date()) {
  const op = db.operations!;
  const date = dayKey(now, op.center.timezone),
    clock = localClock(now, op.center.timezone);
  let changed = 0;
  if (op.center.autoClose)
    for (const v of db.visits.filter(isOpenVisit)) {
      const visitDate = dayKey(v.arrivedAt, op.center.timezone);
      if (visitDate < date || (visitDate === date && clock >= op.center.closingTime)) {
        v.closedAt = now.toISOString();
        v.departureVerified = false;
        v.closureReason = `Administrative closing policy ${op.center.closingTime}; physical departure unverified`;
        v.events ??= [];
        v.events.push({
          at: v.closedAt,
          kind: 'administrative-close',
          actor: 'System',
          reason: v.closureReason,
        });
        db.audit.push({
          id: crypto.randomUUID(),
          action: 'visit:unverified-auto-closure',
          actor: 'System',
          at: v.closedAt,
          entityId: v.id,
        });
        changed++;
      }
    }
  // Catch up safely after server downtime, starting at the explicit migration start day.
  const start = op.center.jobStartDate;
  const dueEnd = clock >= op.center.reportTime ? date : addDays(date, -1);
  for (const d of datesBetween(start, dueEnd)) {
    if (!op.center.operatingDays.includes(weekday(d)) || op.center.closedDates.includes(d))
      continue;
    if (!op.reports.some((r) => r.jobKey === 'daily:' + d)) {
      const report = archiveReport(
        db,
        'daily',
        d,
        now,
        'Scheduled closing snapshot',
        op.reports.some((r) => r.kind === 'daily' && r.period === d),
      );
      report.jobKey = 'daily:' + d;
      changed++;
    }
    const futureOperatingThisWeek = datesBetween(
      addDays(d, 1),
      addDays(d, 7 - ((weekday(d) + 6) % 7) - 1),
    ).some(
      (x) => op.center.operatingDays.includes(weekday(x)) && !op.center.closedDates.includes(x),
    );
    if (
      !futureOperatingThisWeek &&
      !op.reports.some((r) => r.jobKey === 'weekly:' + reportBounds('weekly', d).start)
    ) {
      const key = reportBounds('weekly', d).start;
      const report = archiveReport(
        db,
        'weekly',
        d,
        now,
        'Scheduled end-of-week snapshot',
        op.reports.some((r) => r.kind === 'weekly' && r.period === key),
      );
      report.jobKey = 'weekly:' + key;
      changed++;
    }
  }
  for (const d of datesBetween(start, dueEnd))
    if (
      addDays(d, 1).slice(0, 7) !== d.slice(0, 7) &&
      !op.reports.some((r) => r.jobKey === 'monthly:' + d.slice(0, 7))
    ) {
      const key = d.slice(0, 7);
      const report = archiveReport(
        db,
        'monthly',
        d,
        now,
        'Scheduled month-end snapshot',
        op.reports.some((r) => r.kind === 'monthly' && r.period === key),
      );
      report.jobKey = 'monthly:' + key;
      changed++;
    }
  return changed;
}
export function completionChart(db: Database, id: string, since: string) {
  const op = db.operations!;
  const events = op.completions.filter(
    (c) =>
      c.studentId === id &&
      c.active &&
      (c.completedDate || dayKey(c.at, op.center.timezone)) >= since,
  );
  const grouped = new Map<string, { date: string; Math: number; Reading: number }>();
  for (const c of events) {
    const d = c.completedDate || dayKey(c.at, op.center.timezone);
    const entry = grouped.get(d) || { date: d, Math: 0, Reading: 0 };
    entry[c.subject] += c.worksheets.length;
    grouped.set(d, entry);
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}
