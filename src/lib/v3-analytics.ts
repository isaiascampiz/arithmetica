import { dayKey, isOpenVisit, type Database, type Student, type Visit } from './model';
import { addDays, datesBetween, recurring, weekday, zonedTimestamp } from './schedule';
import type { Subject } from './v2-model';
export type RosterFilter = {
  query: string;
  format: string;
  subject: string;
  early: boolean;
  days: number[];
  medal: string;
  status: string;
};
export function filterRoster(db: Database, f: RosterFilter) {
  const op = db.operations!;
  return db.students
    .filter((s) => {
      const c = op.students[s.id];
      if (![s.name, s.id, s.token].join(' ').toLowerCase().includes(f.query.toLowerCase()))
        return false;
      if (
        (f.status !== 'All' && (f.status === 'Active') !== c.active) ||
        (f.early && !s.earlyLearner)
      )
        return false;
      if (f.days.length && !f.days.some((d) => recurring(op, c).includes(d))) return false;
      const subs = (['Math', 'Reading'] as Subject[]).filter(
        (sub) => c.subjects[sub].enrolled && (f.subject === 'All' || f.subject === sub),
      );
      if (!subs.some((sub) => f.format === 'All' || c.subjects[sub].format === f.format))
        return false;
      if (f.medal !== 'All') {
        const medals = op.achievements.filter(
          (a) => a.studentId === s.id && (f.subject === 'All' || a.subject === f.subject),
        );
        if (
          f.medal === 'None'
            ? medals.length > 0
            : !subs.some(
                (sub) =>
                  (f.format === 'All' || c.subjects[sub].format === f.format) &&
                  medals.some((a) => a.subject === sub && a.distinction === f.medal),
              )
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function measuredMinutes(v: Visit) {
  return v.departedAt && v.departureVerified !== false
    ? Math.max(0, (Date.parse(v.departedAt) - Date.parse(v.arrivedAt)) / 60000)
    : null;
}
export function matchVisit(
  db: Database,
  studentId: string,
  at: string,
  explicitId?: string | null,
) {
  if (explicitId)
    return db.visits.find((v) => v.id === explicitId && v.studentId === studentId) || null;
  const t = Date.parse(at),
    tz = db.operations!.center.timezone;
  const exact = db.visits.filter(
    (v) =>
      v.studentId === studentId &&
      Date.parse(v.arrivedAt) <= t &&
      (v.departedAt || v.closedAt) &&
      Date.parse(v.departedAt || v.closedAt!) >= t,
  );
  if (exact.length === 1) return exact[0];
  const day = db.visits.filter(
    (v) => v.studentId === studentId && dayKey(v.arrivedAt, tz) === dayKey(at, tz),
  );
  return day.length === 1 ? day[0] : null;
}
export function centerActivity(
  db: Database,
  start: string,
  end: string,
  selectedDay: number | null = null,
  now = new Date(),
) {
  const tz = db.operations!.center.timezone;
  const dates = datesBetween(start, end).filter(
    (d) => selectedDay === null || weekday(d) === selectedDay,
  );
  const source = [...new Map(db.visits.map((v) => [v.id, v])).values()];
  const visits = source.filter((v) => dates.includes(dayKey(v.arrivedAt, tz)));
  const bins = Array.from({ length: 24 }, (_, hour) => ({ hour, arrivals: 0, occupancy: 0 }));
  const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hourCycle: 'h23',
  });
  const segments: { from: number; until: number; hour: number }[] = [],
    denominators = Array(24).fill(0);
  // Iterate real elapsed hours. Spring's absent hour and autumn's repeated hour
  // need actual duration denominators, not 24 guessed local boundaries.
  for (const date of dates) {
    const from = Date.parse(zonedTimestamp(date, '00:00', tz)),
      until = Date.parse(zonedTimestamp(addDays(date, 1), '00:00', tz));
    for (let t = from; t < until; t += 3600000) {
      const h = Number(hourFormatter.format(new Date(t))),
        end = Math.min(t + 3600000, until);
      segments.push({ from: t, until: end, hour: h });
      denominators[h] += end - t;
    }
  }
  for (const v of visits) bins[Number(hourFormatter.format(new Date(v.arrivedAt)))].arrivals++;
  let excluded = 0;
  for (const v of source) {
    const date = dayKey(v.arrivedAt, tz);
    const departure =
      v.departedAt && v.departureVerified !== false
        ? Date.parse(v.departedAt)
        : isOpenVisit(v) && date === dayKey(now, tz)
          ? now.getTime()
          : null;
    if (departure === null) {
      if (dates.includes(date)) excluded++;
      continue;
    }
    for (const segment of segments) {
      const { from, until, hour } = segment;
      const overlap = Math.max(
        0,
        Math.min(departure, until) - Math.max(Date.parse(v.arrivedAt), from),
      );
      bins[hour].occupancy += overlap;
    }
  }
  for (const bin of bins) bin.occupancy /= denominators[bin.hour] || 1;
  return {
    bins,
    excluded,
    visits: visits.length,
    days: dates.length,
    live: visits.filter((v) => isOpenVisit(v) && dayKey(v.arrivedAt, tz) === dayKey(now, tz))
      .length,
  };
}
export function studentMedals(db: Database, s: Student) {
  return db.operations!.achievements.filter((a) => a.studentId === s.id);
}
