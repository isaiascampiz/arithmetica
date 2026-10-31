import { dayKey, type Database } from './model';
import type { Subject } from './v2-model';

export type AcademicEvent = {
  id: string;
  at: string;
  level: string;
  start: number;
  end: number;
  label: string;
  kind: 'completion' | 'decision' | 'repeat';
  evidence: 'routine receipt' | 'explicit receipt' | 'verified worksheets' | 'approved decision';
  note: string;
  actor: string;
  fromLevel: string | null;
};

/** Read-only tracking projection. Receipt assumptions never become verified completion records.
 * Dates are when completion was recorded, not an inferred day of work at home.
 */
export function academicHistory(db: Database, studentId: string, subject: Subject) {
  const op = db.operations!;
  const events: AcademicEvent[] = [];
  const seen = new Set<string>();
  const records = db.visits
    .filter((v) => v.studentId === studentId)
    .flatMap((v) => v.sessionRecords || [])
    .filter((r) => r.subject === subject && r.format === 'Paper')
    .toSorted((a, b) => a.at.localeCompare(b.at));
  for (const record of records) {
    for (const incoming of record.incoming) {
      if (incoming.outcome !== 'finished' && incoming.outcome !== 'assumed completed') continue;
      const packet = incoming.packet;
      const key = packet.sourceAssignmentId + ':' + packet.id;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        id: 'receipt:' + key,
        at: record.at,
        ...packet.range,
        label: packet.range.level + packet.range.start + '\u2013' + packet.range.end,
        kind: 'completion',
        evidence: incoming.outcome === 'finished' ? 'explicit receipt' : 'routine receipt',
        note: '',
        actor: record.actor,
        fromLevel: null,
      });
    }
  }
  for (const c of op.completions.filter(
    (c) => c.studentId === studentId && c.subject === subject && c.active && c.worksheets.length,
  )) {
    // Preserve gaps rather than claiming completion of unrecorded pages.
    const sheets = [...new Set(c.worksheets)].sort((a, b) => a - b);
    const ranges: { start: number; end: number }[] = [];
    for (const sheet of sheets) {
      const last = ranges.at(-1);
      if (last && sheet === last.end + 1) last.end = sheet;
      else ranges.push({ start: sheet, end: sheet });
    }
    for (const range of ranges)
      events.push({
        id: 'completion:' + c.id + ':' + range.start,
        at: c.completedDate ? c.completedDate + 'T12:00:00Z' : c.at,
        level: c.level,
        ...range,
        label: c.level + range.start + '\u2013' + range.end,
        kind: 'completion',
        evidence: 'verified worksheets',
        note: c.reason,
        actor: c.verifiedBy,
        fromLevel: null,
      });
  }
  for (const d of op.decisions.filter(
    (d) => d.studentId === studentId && d.subject === subject && d.approvedAt,
  )) {
    const previous = op.configHistory
      .filter((h) => h.studentId === studentId && h.at < d.approvedAt!)
      .toSorted((a, b) => b.at.localeCompare(a.at))[0];
    events.push({
      id: 'decision:' + d.id,
      at: d.approvedAt!,
      ...d.range,
      label: d.range.level + d.range.start + '\u2013' + d.range.end,
      kind: d.kind.includes('repeat') ? 'repeat' : 'decision',
      evidence: 'approved decision',
      note: d.note,
      actor: d.author,
      fromLevel: d.kind.includes('repeat') ? previous?.subjects[subject]?.level || null : null,
    });
  }
  return events.sort(
    (a, b) => a.at.localeCompare(b.at) || a.start - b.start || a.id.localeCompare(b.id),
  );
}

export function academicPlot(db: Database, subject: Subject, events: AcademicEvent[]) {
  const catalog = db
    .operations!.v3!.catalog.filter((l) => l.subject === subject)
    .toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const completed = events.filter((e) => e.kind === 'completion');
  const points = completed.flatMap((event) => {
    const rank = catalog.findIndex((l) => l.id === event.level);
    if (rank < 0) return [];
    // 200 is a display interval for unbounded catalogs, not a progression/validation bound.
    const scale = Math.max(
      catalog[rank].last || 200,
      ...completed.filter((e) => e.level === event.level).map((e) => e.end),
    );
    return [
      {
        id: event.id,
        at: event.at,
        level: event.level,
        rank,
        position: rank + event.end / scale,
        events: [event],
      },
    ];
  });
  const low = Math.min(...points.map((p) => p.rank)),
    high = Math.max(...points.map((p) => p.rank));
  return {
    points,
    levels: points.length ? catalog.slice(low, high + 1) : [],
    unknown: completed.filter((e) => !catalog.some((l) => l.id === e.level)),
  };
}

export const academicPeriods = [
  '8 weeks',
  'All time',
  '1 year',
  '6 months',
  '3 months',
  '1 month',
  '1 week',
] as const;
export type AcademicPeriod = (typeof academicPeriods)[number];
export type AcademicWindowPeriod = AcademicPeriod | '8 weeks';
const dateNumber = (day: string) => Date.parse(day + 'T12:00:00Z');
const shiftedDay = (day: string, count: number) =>
  new Date(dateNumber(day) + count * 86400000).toISOString().slice(0, 10);

/** Calendar windows use center-local day keys, keeping DST and month lengths out of millisecond arithmetic. */
export function academicWindow(
  period: AcademicWindowPeriod,
  offset: number,
  today: string,
  first: string,
) {
  if (period === 'All time') return { start: first, end: today };
  if (period === '8 weeks') {
    const monday = shiftedDay(today, -((new Date(dateNumber(today)).getUTCDay() + 6) % 7));
    const start = shiftedDay(monday, -49 + offset * 56);
    return { start, end: offset === 0 ? today : shiftedDay(start, 55) };
  }
  const d = new Date(dateNumber(today));
  if (period === '1 week') {
    const monday = shiftedDay(today, -((d.getUTCDay() + 6) % 7) + offset * 7);
    return { start: monday, end: shiftedDay(monday, 6) };
  }
  const months =
    period === '1 year' ? 12 : period === '6 months' ? 6 : period === '3 months' ? 3 : 1;
  const month = period === '1 year' ? 0 : d.getUTCMonth() - months + 1;
  const start = new Date(Date.UTC(d.getUTCFullYear(), month + offset * months, 1, 12));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 0, 12));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function academicCheckpoints<T extends { at: string; id: string }>(
  points: T[],
  period: AcademicWindowPeriod,
  timezone: string,
) {
  const daily = new Map<string, T>();
  for (const point of points.toSorted(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  ))
    daily.set(dayKey(point.at, timezone), point);
  const values = [...daily.values()];
  if (period === '1 week') return { daily: values, checkpoints: values };
  if (period === '1 year') {
    const months = new Map<string, T>();
    for (const [day, point] of daily) months.set(day.slice(0, 7), point);
    return { daily: values, checkpoints: [...months.values()] };
  }
  if (values.length <= 14) return { daily: values, checkpoints: values };
  // Select real records close to evenly spaced time targets, including both endpoints.
  // Never manufacture an observation at a target date or change the saved history.
  const times = [...daily.keys()].map(dateNumber);
  const selected = new Set<number>();
  let nearest = 0;
  for (let i = 0; i < 14; i++) {
    const target = times[0] + ((times.at(-1)! - times[0]) * i) / 13;
    while (
      nearest + 1 < times.length &&
      Math.abs(times[nearest + 1] - target) < Math.abs(times[nearest] - target)
    )
      nearest++;
    selected.add(nearest);
  }
  return {
    daily: values,
    checkpoints: [...selected].map((index) => values[index]),
  };
}

/** Calendar labels are independent of checkpoint density and use one consistent cadence. */
export function academicDateTicks(start: string, end: string, maxLabels: number) {
  const span = Math.max(0, Math.round((dateNumber(end) - dateNumber(start)) / 86400000));
  const budget = Math.max(2, maxLabels);
  const ticks: string[] = [];
  if (span < 60) {
    const base = span <= 7 ? 1 : 7;
    const step = base * Math.max(1, Math.ceil((Math.floor(span / base) + 1) / budget));
    for (let i = 0; i <= span; i += step) ticks.push(shiftedDay(start, i));
    return ticks;
  }
  const first = new Date(dateNumber(start)),
    last = new Date(dateNumber(end));
  const firstMonth =
    first.getUTCFullYear() * 12 + first.getUTCMonth() + (first.getUTCDate() === 1 ? 0 : 1);
  const lastMonth = last.getUTCFullYear() * 12 + last.getUTCMonth();
  const count = Math.max(1, lastMonth - firstMonth + 1);
  const step = Math.max(1, Math.ceil(count / budget));
  for (let month = firstMonth; month <= lastMonth; month += step)
    ticks.push(
      new Date(Date.UTC(Math.floor(month / 12), month % 12, 1, 12)).toISOString().slice(0, 10),
    );
  return ticks;
}

/** Fit the visible trend without changing the physical plot height or forcing a whole level. */
export function academicYDomain(positions: number[], low: number, high: number) {
  if (!positions.length) return { bottom: 0, top: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  const min = Math.min(...positions) * 200,
    max = Math.max(...positions) * 200;
  const padding = Math.max(max === min ? 5 : 1, (max - min) * 0.08);
  const lower = low * 200,
    upper = high * 200;
  for (let power = -1; power <= 6; power++) {
    for (const base of [1, 2, 2.5, 5]) {
      const step = base * 10 ** power;
      if (!Number.isInteger(step)) continue;
      const span = step * 4;
      if (span < max - min + padding * 2 || span > upper - lower) continue;
      const bottom = Math.max(
        lower,
        Math.min(Math.floor((min - padding) / step) * step, upper - span),
      );
      const top = bottom + span;
      if (bottom > min || top < max) continue;
      return {
        bottom: bottom / 200,
        top: top / 200,
        ticks: Array.from({ length: 5 }, (_, i) => (bottom + step * i) / 200),
      };
    }
  }
  return {
    bottom: low,
    top: high,
    ticks: Array.from({ length: 5 }, (_, i) => low + ((high - low) * i) / 4),
  };
}
