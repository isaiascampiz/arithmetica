import { seed } from '../../src/lib/seed';
import { dayKey, type Database } from '../../src/lib/model';
import { addDays, datesBetween, weekday, zonedTimestamp } from '../../src/lib/schedule';

export const activityDemoPrefix = 'fictional-center-activity-v1';

/** Explicit, additive simulation only. No existing attendance, packets or notes change. */
export function addFictionalCenterActivity(db: Database, now = new Date()) {
  const seedNames = new Map(seed(now).students.map((s) => [s.id, s.name]));
  if (
    !db.operations ||
    db.schemaVersion !== 3 ||
    !db.students.length ||
    !db.students.every((s) => s.name.startsWith('Fictional ') || seedNames.get(s.id) === s.name)
  )
    throw Error('Only the known fictional demo roster is supported.');
  const tz = db.operations.center.timezone,
    today = dayKey(now, tz);
  const marker = activityDemoPrefix + ':' + today;
  if (db.audit.some((a) => a.id === marker)) return 0;
  const ids = new Set(db.visits.map((v) => v.id));
  const actor = 'Fictional attendance simulation';
  let added = 0;
  for (const date of datesBetween(addDays(today, -63), today)) {
    if (weekday(date) === 0 || db.operations.center.closedDates.includes(date)) continue;
    const saturday = weekday(date) === 6;
    const count = Math.min(
      db.students.length,
      16 + ((weekday(date) * 3 + Number(date.slice(-2))) % 15),
    );
    for (let i = 0; i < count; i++) {
      const student = db.students[i],
        id = `${activityDemoPrefix}:${date}:${student.id}`;
      const hour = (saturday ? 10 : 13) + Math.floor((i * (saturday ? 4 : 6)) / count);
      const minute = (i * 13 + Number(date.slice(-2)) * 3) % 60;
      const arrivedAt = zonedTimestamp(
        date,
        `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        tz,
      );
      // A running demo never invents a future punch or opens simulated live visits.
      const departedAt = new Date(Date.parse(arrivedAt) + (25 + (i % 7) * 5) * 60000).toISOString();
      if (ids.has(id) || Date.parse(departedAt) > now.getTime()) continue;
      db.visits.push({
        id,
        studentId: student.id,
        arrivedAt,
        departedAt,
        departureVerified: true,
        events: [
          {
            at: arrivedAt,
            kind: 'arrival',
            actor,
            reason: 'Explicit fictional chart sample.',
          },
          {
            at: departedAt,
            kind: 'staff-departure',
            actor,
            reason: 'Explicit fictional chart sample.',
          },
        ],
      });
      ids.add(id);
      added++;
    }
  }
  db.audit.push({
    id: marker,
    action: 'demo:fictional-center-activity',
    actor,
    at: now.toISOString(),
    entityId: marker,
  });
  return added;
}
