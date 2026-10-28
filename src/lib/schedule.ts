import type { Database } from './model';
import { dayKey } from './model';
import type { Operations, StudentSettings } from './v2-model';
export function expectedMinutes(op: Operations, c: StudentSettings) {
  return c.expectedMinutesOverride ? c.expectedMinutes : op.center.expectedMinutes;
}
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
export function datesBetween(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 3700; d = addDays(d, 1)) out.push(d);
  return out;
}
export function recurring(op: Operations, c: StudentSettings) {
  if (op.v3) return (c.visitDays ?? c.recurringDays).filter((d) => d >= 1 && d <= 4);
  return c.familyId && !c.individualSchedule
    ? (op.families.find((f) => f.id === c.familyId)?.recurringDays ?? c.recurringDays)
    : c.recurringDays;
}
export function expectedOn(op: Operations, studentId: string, date: string) {
  const c = op.students[studentId];
  if (op.v3)
    return Boolean(
      c?.active &&
      !(c.awayUntil && date < c.awayUntil) &&
      !op.center.closedDates.includes(date) &&
      weekday(date) >= 1 &&
      weekday(date) <= 4 &&
      (c.awayUntil === date || recurring(op, c).includes(weekday(date))),
    );
  if (
    !c?.active ||
    op.center.closedDates.includes(date) ||
    !op.center.operatingDays.includes(weekday(date))
  )
    return false;
  const events = op.scheduleEvents.filter(
    (e) =>
      !e.cancelledAt && (e.studentId === studentId || (!e.studentId && e.familyId === c.familyId)),
  );
  // Individual exceptions override family changes; center closures stay authoritative.
  for (const scoped of [
    events.filter((e) => e.studentId === studentId),
    events.filter((e) => !e.studentId),
  ]) {
    if (
      scoped.some(
        (e) =>
          (e.kind === 'extra-visit' && e.start === date) ||
          (e.kind === 'move-visit' && e.returnDate === date),
      )
    )
      return true;
    if (
      scoped.some(
        (e) =>
          ['absence', 'vacation', 'move-visit'].includes(e.kind) &&
          date >= e.start &&
          date <= e.end,
      )
    )
      return false;
  }
  return recurring(op, c).includes(weekday(date));
}
export function nextExpected(op: Operations, id: string, after: string, inclusive = false) {
  for (let i = inclusive ? 0 : 1; i <= 370; i++) {
    const d = addDays(after, i);
    if (expectedOn(op, id, d)) return d;
  }
  return null;
}
export function nextOperating(op: Operations, after: string) {
  for (let i = 1; i <= 370; i++) {
    const d = addDays(after, i);
    if (op.center.operatingDays.includes(weekday(d)) && !op.center.closedDates.includes(d))
      return d;
  }
  return null;
}
export function expectedToday(db: Database, now = new Date()) {
  const op = db.operations!;
  const date = dayKey(now, op.center.timezone);
  return db.students.filter((s) => expectedOn(op, s.id, date));
}
export function upcomingVacation(op: Operations, id: string, from: string) {
  const c = op.students[id];
  return op.scheduleEvents
    .filter(
      (e) =>
        !e.cancelledAt &&
        e.kind === 'vacation' &&
        e.start >= from &&
        (e.studentId === id || (!e.studentId && e.familyId === c.familyId)),
    )
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}
export function lastVisitBeforeVacation(op: Operations, id: string, from: string) {
  const v = upcomingVacation(op, id, from);
  if (!v) return null;
  for (let d = addDays(v.start, -1), i = 0; i < 370; i++, d = addDays(d, -1))
    if (expectedOn(op, id, d)) return d;
  return null;
}
export function localClock(now: Date, tz: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}
export function zonedTimestamp(date: string, clock: string, tz: string) {
  const target = new Date(`${date}T${clock}:00Z`).getTime();
  let stamp = target;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(stamp));
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const rendered = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    stamp += target - rendered;
  }
  if (dayKey(new Date(stamp), tz) !== date || localClock(new Date(stamp), tz) !== clock)
    throw new Error('That local time does not exist in the center timezone.');
  return new Date(stamp).toISOString();
}
