import { dayKey, type Database, type Observation, type Visit } from './model';
import type { Completion, Evaluation, Decision } from './v2-model';
import { verifiedPaperEntries } from './completion-evidence';
import { activityTimeline, type ActivityRecord } from './activity-overview';
import { matchVisit, measuredMinutes } from './v3-analytics';
import { centerName } from './brand';
import type { Subject } from './v2-model';

export type WorksheetSummary = {
  studentId: string;
  studentName: string;
  grade: string | null;
  subject: Subject;
  lastVerifiedLevel: string | null;
  lastVerifiedWorksheet: number | null;
  worksheets: number;
  packetEquivalents: number;
};

export type ReportDetail = {
  version: 2;
  centerName: string;
  timezone: string;
  start: string;
  end: string;
  asOf: string;
  provisional: boolean;
  visits: { visit: Visit; studentName: string; minutes: number | null; notes: Observation[] }[];
  completions: (Completion & { studentName: string })[];
  events: ActivityRecord[];
  pendingNotes: (Observation & { studentName: string })[];
  unresolved: number;
  excludedCompletions: number;
  days: { date: string; visits: number; sheets: number }[];
  levels: { subject: string; level: string; sheets: number }[];
  busiest: { label: string; arrivals: number } | null;
  /** Additive frozen metadata; older archives retain unknown grades rather than current guesses. */
  worksheetSummary?: WorksheetSummary[];
  evaluatedVisitIds?: string[];
  evaluations?: Evaluation[];
  decisions?: Decision[];
};

/** Materialize all detail once: archived UI and exports never read mutable records. */
export function buildReportDetail(
  db: Database,
  start: string,
  end: string,
  now: Date,
): ReportDetail {
  const op = db.operations!,
    tz = op.center.timezone;
  const inPeriod = (date: string) => date >= start && date <= end;
  const known = (at: string) => Date.parse(at) <= now.getTime();
  const name = (id: string) => db.students.find((s) => s.id === id)?.name || 'Historical student';
  const visits = [...new Map(db.visits.map((v) => [v.id, v])).values()]
    .filter((v) => known(v.arrivedAt) && inPeriod(dayKey(v.arrivedAt, tz)))
    .map((original) => {
      const v = structuredClone(original);
      if (v.departedAt && !known(v.departedAt)) v.departedAt = null;
      if (v.closedAt && !known(v.closedAt)) delete v.closedAt;
      v.sessionRecords = v.sessionRecords?.filter((r) => known(r.at));
      v.events = v.events?.filter((e) => known(e.at));
      return v;
    })
    .sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt) || a.id.localeCompare(b.id));
  const completions = verifiedPaperEntries(db)
    .filter((c) => known(c.at) && inPeriod(c.completedDate || dayKey(c.at, tz)))
    .map((c) => ({ ...structuredClone(c), studentName: name(c.studentId) }));
  const accepted = new Set(completions.map((c) => c.id));
  const days = new Map<string, { date: string; visits: number; sheets: number }>();
  const levels = new Map<string, { subject: string; level: string; sheets: number }>();
  const hours = new Map<string, number>();
  const hour = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric' });
  for (const visit of visits) {
    const date = dayKey(visit.arrivedAt, tz),
      day = days.get(date) || { date, visits: 0, sheets: 0 };
    day.visits++;
    days.set(date, day);
    const key = hour.format(new Date(visit.arrivedAt));
    hours.set(key, (hours.get(key) || 0) + 1);
  }
  for (const completion of completions) {
    const date = completion.completedDate || dayKey(completion.at, tz),
      day = days.get(date) || { date, visits: 0, sheets: 0 };
    day.sheets += completion.physicalSheets;
    days.set(date, day);
    const key = completion.subject + ':' + completion.level,
      level = levels.get(key) || {
        subject: completion.subject,
        level: completion.level,
        sheets: 0,
      };
    level.sheets += completion.physicalSheets;
    levels.set(key, level);
  }
  const busiest = [...hours].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const verifiedThroughEnd = verifiedPaperEntries(db).filter(
    (c) => known(c.at) && (c.completedDate || dayKey(c.at, tz)) <= end,
  );
  const worksheetSummary: WorksheetSummary[] = db.students.flatMap((student) => {
    const history = op.configHistory
      .filter((h) => h.studentId === student.id && known(h.at) && dayKey(h.at, tz) <= end)
      .sort((a, b) => a.at.localeCompare(b.at))
      .at(-1);
    const settings = history?.settings || (end >= dayKey(now, tz) ? op.students[student.id] : null);
    return (['Math', 'Reading'] as Subject[])
      .filter(
        (subject) =>
          completions.some((c) => c.studentId === student.id && c.subject === subject) ||
          (visits.some((v) => v.studentId === student.id) &&
            (history?.subjects[subject].enrolled ??
              settings?.subjects[subject].enrolled ??
              student.subjects.includes(subject))),
      )
      .map((subject) => {
        const last = verifiedThroughEnd
          .filter((c) => c.studentId === student.id && c.subject === subject)
          .sort(
            (a, b) =>
              (a.completedDate || dayKey(a.at, tz)).localeCompare(
                b.completedDate || dayKey(b.at, tz),
              ) ||
              a.at.localeCompare(b.at) ||
              a.id.localeCompare(b.id),
          )
          .at(-1);
        const worksheets = completions
          .filter((c) => c.studentId === student.id && c.subject === subject)
          .reduce((n, c) => n + c.physicalSheets, 0);
        return {
          studentId: student.id,
          studentName: history?.name || student.name,
          grade: settings?.grade || null,
          subject,
          lastVerifiedLevel: last?.level || null,
          lastVerifiedWorksheet: last ? Math.max(...last.worksheets) : null,
          worksheets,
          packetEquivalents: worksheets / 10,
        };
      });
  });
  return {
    version: 2,
    worksheetSummary,
    evaluations: structuredClone(
      op.evaluations.filter(
        (e) =>
          known(e.createdAt) &&
          visits.some((v) => matchVisit(db, e.studentId, e.createdAt)?.id === v.id),
      ),
    ),
    decisions: structuredClone(
      op.decisions.filter(
        (e) =>
          known(e.createdAt) &&
          visits.some((v) => matchVisit(db, e.studentId, e.createdAt)?.id === v.id),
      ),
    ),
    evaluatedVisitIds: op.evaluations
      .filter((e) => known(e.createdAt))
      .flatMap((e) => {
        const visit = matchVisit(db, e.studentId, e.createdAt);
        return visit && visits.some((v) => v.id === visit.id) ? [visit.id] : [];
      }),
    centerName: centerName(op.center.name),
    timezone: tz,
    start,
    end,
    asOf: now.toISOString(),
    provisional: end >= dayKey(now, tz),
    visits: visits.map((visit) => ({
      visit: structuredClone(visit),
      studentName: name(visit.studentId),
      minutes: measuredMinutes(visit),
      notes: structuredClone(
        db.observations.filter(
          (o) =>
            known(o.createdAt) &&
            matchVisit(db, o.studentId, o.createdAt, o.visitId)?.id === visit.id,
        ),
      ),
    })),
    completions,
    events: structuredClone(activityTimeline(db, now).filter((e) => inPeriod(dayKey(e.at, tz)))),
    pendingNotes: structuredClone(
      db.observations
        .filter(
          (o) =>
            known(o.createdAt) &&
            dayKey(o.createdAt, tz) <= end &&
            (!o.reviewedAt || dayKey(o.reviewedAt, tz) > end),
        )
        .map((o) => ({ ...o, studentName: name(o.studentId) })),
    ),
    unresolved: visits.filter((v) => !v.departedAt || v.departureVerified === false).length,
    excludedCompletions: op.completions.filter(
      (c) =>
        c.active &&
        known(c.at) &&
        inPeriod(c.completedDate || dayKey(c.at, tz)) &&
        !accepted.has(c.id) &&
        c.format !== 'CONNECT',
    ).length,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    levels: [...levels.values()].sort(
      (a, b) => a.subject.localeCompare(b.subject) || a.level.localeCompare(b.level),
    ),
    busiest: busiest ? { label: busiest[0], arrivals: busiest[1] } : null,
  };
}
