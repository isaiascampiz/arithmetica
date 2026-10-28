import { dayKey, type Database, type Visit } from './model';
import { addDays, datesBetween, weekday } from './schedule';
import { activitySettings, hourLabel } from './activity-settings';

export type ArrivalBin = {
  key: string;
  label: string;
  actual: number | null;
  expected: number | null;
  samples: number;
  partial: boolean;
};
export type Punch = {
  id: string;
  visitId: string;
  studentId: string;
  at: string;
  kind:
    | 'Check-in'
    | 'Check-out'
    | 'Unverified departure'
    | 'Administrative closure'
    | 'Attendance change';
  actor: string;
  reason: string;
  events: NonNullable<Visit['events']>;
};

/** A physical timestamp is counted once per visit. Closures are never check-outs. */
export function attendancePunches(db: Database, now = new Date()): Punch[] {
  const rows: Punch[] = [];
  for (const v of new Map(db.visits.map((v) => [v.id, v])).values()) {
    const push = (at: string | null | undefined, kind: Punch['kind']) => {
      if (!at || !Number.isFinite(Date.parse(at)) || Date.parse(at) > now.getTime()) return;
      const event = v.events?.findLast((e) =>
        kind === 'Check-in'
          ? e.kind === 'arrival'
          : kind === 'Administrative closure'
            ? e.kind === 'administrative-close'
            : e.kind === 'verified-correction' || (e.kind === 'staff-departure' && e.at === at),
      );
      rows.push({
        id: v.id + ':' + kind,
        visitId: v.id,
        studentId: v.studentId,
        at,
        kind,
        actor: event?.actor || 'Not recorded',
        reason: event?.reason || (kind === 'Administrative closure' ? v.closureReason || '' : ''),
        events: v.events || [],
      });
    };
    push(v.arrivedAt, 'Check-in');
    push(v.departedAt, v.departureVerified === false ? 'Unverified departure' : 'Check-out');
    push(v.closedAt, 'Administrative closure');
    // Preserve audit events even when a visit was reopened or its departure corrected.
    // They are changes to attendance, never additional effective arrival/departure counts.
    for (const [index, event] of (v.events || []).entries()) {
      if (
        (['reopened', 'verified-correction'].includes(event.kind) ||
          (event.kind === 'staff-departure' && event.at !== v.departedAt) ||
          (event.kind === 'administrative-close' && event.at !== v.closedAt)) &&
        Number.isFinite(Date.parse(event.at)) &&
        Date.parse(event.at) <= now.getTime()
      )
        rows.push({
          id: v.id + ':event:' + index,
          visitId: v.id,
          studentId: v.studentId,
          at: event.at,
          kind: 'Attendance change',
          actor: event.actor,
          reason: [event.kind, event.reason, event.value].filter(Boolean).join(' · '),
          events: v.events || [],
        });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

/** Eight prior matching weekdays. Only completed, non-closure dates within
 * recorded coverage contribute, including dates with zero recorded arrivals.
 * An average is an estimate of arrivals, never occupancy or attendance proof. */
export function arrivalComparison(
  db: Database,
  date: string,
  period: 'Daily' | 'Weekly',
  now = new Date(),
  allHours = false,
) {
  const tz = db.operations!.center.timezone,
    today = dayKey(now, tz);
  const settings = activitySettings(db);
  const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hourCycle: 'h23',
  });
  const hour = (at: string | Date) => Number(hourFormatter.format(new Date(at)));
  const source = [...new Map(db.visits.map((v) => [v.id, v])).values()]
    .filter(
      (v) => Number.isFinite(Date.parse(v.arrivedAt)) && Date.parse(v.arrivedAt) <= now.getTime(),
    )
    .map((v) => ({ date: dayKey(v.arrivedAt, tz), hour: hour(v.arrivedAt) }));
  const firstDate = source.reduce((first, v) => (v.date < first ? v.date : first), today);
  const counts = new Map<string, number>(),
    totals = new Map<string, number>();
  for (const v of source) {
    const key = v.date + '|' + v.hour;
    counts.set(key, (counts.get(key) || 0) + 1);
    totals.set(v.date, (totals.get(v.date) || 0) + 1);
  }
  const start = period === 'Daily' ? date : addDays(date, -((weekday(date) + 6) % 7));
  const end = period === 'Daily' ? date : addDays(start, 6);
  const closed = new Set(db.operations!.center.closedDates);
  const priorDates = (day: string) =>
    Array.from({ length: 8 }, (_, i) => addDays(day, -7 * (i + 1))).filter(
      (d) => d >= firstDate && d < today && d < start && !closed.has(d),
    );
  const average = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  let bins: ArrivalBin[];
  if (period === 'Daily') {
    const selected = settings.days.find((d) => d.day === weekday(date))!;
    const prior = priorDates(date);
    bins = Array.from({ length: 24 }, (_, h) => {
      const actual =
        date > today || (date === today && h > hour(now)) ? null : counts.get(date + '|' + h) || 0;
      // Display hours shape the axis; historical traffic outside them still
      // participates in the comparison, including traffic on disabled days.
      const expected = !closed.has(date)
        ? average(prior.map((d) => counts.get(d + '|' + h) || 0))
        : null;
      return {
        key: String(h),
        label: hourLabel(h),
        actual,
        expected,
        samples: expected === null ? 0 : prior.length,
        partial: date === today && h === hour(now),
      };
    }).filter(
      (b) =>
        allHours ||
        (selected.enabled && Number(b.key) >= selected.start && Number(b.key) < selected.end) ||
        (b.actual || 0) > 0 ||
        (b.expected || 0) > 0,
    );
  } else {
    bins = datesBetween(start, end).map((d) => {
      const selected = settings.days.find((s) => s.day === weekday(d))!;
      const prior = priorDates(d);
      const historical = average(prior.map((p) => totals.get(p) || 0));
      const expected =
        !closed.has(d) && (selected.enabled || (historical || 0) > 0) ? historical : null;
      return {
        key: d,
        label: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(
          new Date(d + 'T12:00:00Z'),
        ),
        actual: d > today ? null : totals.get(d) || 0,
        expected,
        samples: expected === null ? 0 : prior.length,
        partial: d === today,
      };
    });
  }
  const visible = source.filter((v) => v.date >= start && v.date <= end);
  return {
    bins,
    start,
    end,
    total: visible.length,
    expectedTotal: bins.some((b) => b.expected !== null)
      ? bins.reduce((n, b) => n + (b.expected || 0), 0)
      : null,
    nextHour:
      period === 'Daily' && date === today
        ? bins.find((b) => Number(b.key) === hour(now) + 1)
        : undefined,
  };
}
