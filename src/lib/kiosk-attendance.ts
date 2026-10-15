import { randomUUID } from 'node:crypto';
import { DomainError, attendance } from './domain';
import { dayKey, isOpenVisit, type Database } from './model';
export function kioskScan(
  db: Database,
  token: string,
  now = new Date(),
): { message: string; changed: boolean; direction?: 'in' | 'out' } {
  const student = db.students.find((s) => s.token === token);
  if (!student || db.operations?.students[student.id].active === false)
    throw new DomainError('Code not recognized. Please ask a staff member.', 404);
  const last = db.audit
    .filter((a) => a.entityId === student.id && a.action.startsWith('kiosk-'))
    .at(-1);
  if (last && now.getTime() - Date.parse(last.at) < 30000)
    return { message: 'Scan already recorded. Please wait before scanning again.', changed: false };
  const open = db.visits.find((v) => v.studentId === student.id && isOpenVisit(v));
  const tz = db.operations?.center.timezone || 'America/Los_Angeles';
  if (open && dayKey(open.arrivedAt, tz) !== dayKey(now, tz))
    throw new DomainError('A previous visit needs staff review. Please ask at reception.', 409);
  if (db.visits.some((v) => v.studentId === student.id && v.closedAt && !v.departureVerified))
    throw new DomainError('Attendance needs staff review. Please ask at reception.', 409);
  const direction = open ? 'out' : 'in';
  const result = attendance(db, student.id, direction, now);
  db.audit.push({
    id: randomUUID(),
    action: `kiosk-${direction}`,
    actor: 'Entrance kiosk',
    at: now.toISOString(),
    entityId: student.id,
  });
  return { ...result, direction };
}
