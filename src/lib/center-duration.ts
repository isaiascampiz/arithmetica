import { dayKey, type Database } from './model';
import { measuredMinutes } from './v3-analytics';
import { addDays, weekday } from './schedule';

export type DurationVisit = {
  id: string;
  day: string;
  arrivedAt: string;
  departedAt: string;
  minutes: number;
};

/** Physical attendance only, with the existing legacy departure compatibility rule. */
export function durationVisits(db: Database, studentId: string): DurationVisit[] {
  return db.visits
    .filter((v) => v.studentId === studentId)
    .flatMap((v) => {
      const minutes = measuredMinutes(v);
      if (
        minutes === null ||
        !Number.isFinite(minutes) ||
        Date.parse(v.departedAt!) < Date.parse(v.arrivedAt)
      )
        return [];
      return [
        {
          id: v.id,
          day: dayKey(v.arrivedAt, db.operations!.center.timezone),
          arrivedAt: v.arrivedAt,
          departedAt: v.departedAt!,
          minutes,
        },
      ];
    })
    .sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt) || a.id.localeCompare(b.id));
}

export function durationTotals(visits: DurationVisit[]) {
  const total = visits.reduce((sum, v) => sum + v.minutes, 0);
  return { total, count: visits.length, average: visits.length ? total / visits.length : null };
}

export function durationBuckets(
  visits: DurationVisit[],
  start: string,
  end: string,
  unit: 'day' | 'week' | 'month',
) {
  const result: ({ start: string; end: string; records: DurationVisit[] } & ReturnType<
    typeof durationTotals
  >)[] = [];
  let cursor =
    unit === 'week'
      ? addDays(start, -((weekday(start) + 6) % 7))
      : unit === 'month'
        ? start.slice(0, 7) + '-01'
        : start;
  for (let guard = 0; cursor <= end && guard < 3700; guard++) {
    const next =
      unit === 'day'
        ? addDays(cursor, 1)
        : unit === 'week'
          ? addDays(cursor, 7)
          : new Date(Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 1, 12))
              .toISOString()
              .slice(0, 10);
    const from = cursor < start ? start : cursor,
      to = addDays(next, -1) > end ? end : addDays(next, -1);
    const records = visits.filter((v) => v.day >= from && v.day <= to);
    result.push({ start: from, end: to, records, ...durationTotals(records) });
    cursor = next;
  }
  return result;
}

/** Four legible intervals, a zero baseline, and no clipping of long visits. */
export function durationAxis(averages: (number | null)[]) {
  const max = Math.max(1, ...averages.filter((n): n is number => n !== null));
  const raw = max / 4,
    magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= raw)! * magnitude;
  return { top: step * 4, ticks: [0, step, step * 2, step * 3, step * 4] };
}
