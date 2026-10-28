import { dayKey, type Database } from './model';
import { arrivalComparison, attendancePunches, type ArrivalBin } from './center-arrivals';
import { activityOverview } from './activity-overview';
import { addDays } from './schedule';
import { calendarBuckets } from './calendar-buckets';
import { progressDateLabel } from './progress-chart';

export type AttendancePeriod = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
export function moveAttendanceDate(day: string, period: AttendancePeriod, direction: number) {
  if (period === 'Daily' || period === 'Weekly')
    return addDays(day, direction * (period === 'Daily' ? 1 : 7));
  const months = period === 'Yearly' ? 12 : 1;
  return new Date(
    Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1 + months * direction, 1, 12),
  )
    .toISOString()
    .slice(0, 10);
}

/** One attendance selection drives summary, chart, exact-value inspection and punch list. */
export function centerAttendance(
  db: Database,
  date: string,
  period: AttendancePeriod,
  query: string,
  now: Date,
) {
  const today = dayKey(now, db.operations!.center.timezone),
    tz = db.operations!.center.timezone;
  const matching = new Set(
    db.students
      .filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
      .map((s) => s.id),
  );
  const source: Database = query.trim()
    ? {
        ...db,
        students: db.students.filter((s) => matching.has(s.id)),
        visits: db.visits.filter((v) => matching.has(v.studentId)),
      }
    : db;
  const punches = attendancePunches(source, now);
  const compare = period === 'Daily' || period === 'Weekly';
  let start: string,
    end: string,
    bins: ArrivalBin[],
    typical: number | null = null;
  if (compare) {
    const result = arrivalComparison(source, date, period, now, period === 'Daily');
    start = result.start;
    end = result.end;
    bins = result.bins;
    typical = result.expectedTotal;
  } else {
    const year = Number(date.slice(0, 4)),
      month = Number(date.slice(5, 7));
    start = new Date(Date.UTC(year, period === 'Yearly' ? 0 : month - 1, 1, 12))
      .toISOString()
      .slice(0, 10);
    end = new Date(Date.UTC(year, period === 'Yearly' ? 12 : month, 0, 12))
      .toISOString()
      .slice(0, 10);
    const unit = period === 'Yearly' ? 'month' : 'day';
    bins = calendarBuckets(
      punches.filter((p) => p.kind === 'Check-in').map((p) => ({ ...p, day: dayKey(p.at, tz) })),
      start,
      end,
      unit,
    ).map((b) => ({
      key: b.start,
      label: progressDateLabel(b.start, start, end),
      actual: b.start > today ? null : b.records.length,
      expected: null,
      samples: 0,
      partial: b.start <= today && b.end >= today,
    }));
  }
  const rows = punches.filter((p) => dayKey(p.at, tz) >= start && dayKey(p.at, tz) <= end);
  const arrivals = rows.filter((p) => p.kind === 'Check-in');
  return {
    start,
    end,
    bins,
    compare,
    typical,
    rows,
    total: arrivals.length,
    students: new Set(arrivals.map((p) => p.studentId)).size,
    includesToday: start <= today && end >= today,
    live: activityOverview(source, now),
  };
}

/** Five readable integer-count ticks, always including zero and all plotted values. */
export function attendanceAxis(bins: ArrivalBin[]) {
  const highest = Math.max(1, ...bins.flatMap((b) => [b.actual || 0, b.expected || 0]));
  const raw = highest / 4,
    power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(
    1,
    Math.ceil(([1, 2, 2.5, 5, 10].find((n) => n * power >= raw) || 10) * power),
  );
  const ceiling = step * 4;
  return { ceiling, ticks: [ceiling, ceiling - step, ceiling - step * 2, step, 0] };
}
