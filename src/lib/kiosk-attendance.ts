import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError, attendance } from './domain';
import { dayKey, isOpenVisit, type Database } from './model';
import { closeDueVisits } from './reports';
export function validateReceptionReceipts(db: Database) {
  const saved = db.operations?.v3?.receptionReceipts;
  if (saved !== undefined)
    z.record(
      z.string().uuid(),
      z
        .object({
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          result: z
            .object({
              message: z.string().max(500),
              changed: z.boolean(),
              direction: z.enum(['in', 'out']).optional(),
              studentName: z.string().min(1).max(120).optional(),
            })
            .strict(),
        })
        .strict(),
    ).parse(saved);
}
export function receptionEntry(
  db: Database,
  entry: { token?: string; name?: string; requestId?: string },
  now = new Date(),
) {
  const id = entry.requestId ? z.string().uuid().parse(entry.requestId) : undefined;
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        name: entry.name?.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'),
        token: entry.token?.trim(),
      }),
    )
    .digest('hex');
  const receipts = db.operations?.v3?.receptionReceipts,
    prior = id ? receipts?.[id] : undefined;
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      throw new DomainError('Request ID was already used for another attendance entry.', 409);
    return { ...prior.result };
  }
  closeDueVisits(db, now);
  let result: ReturnType<typeof kioskScan>;
  if (entry.name) {
    const normalized = entry.name
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('en-US');
    const matches = db.students.filter(
      (s) =>
        s.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') ===
          normalized && db.operations?.students[s.id]?.active !== false,
    );
    if (matches.length !== 1)
      throw new DomainError(
        'We couldn’t confirm that name. Please use your pouch or ask at reception.',
        404,
      );
    result = kioskScan(db, matches[0].token, now);
  } else result = kioskScan(db, entry.token || '', now);
  if (id && db.operations?.v3)
    (db.operations.v3.receptionReceipts ??= {})[id] = { fingerprint, result };
  return result;
}
export function kioskScan(
  db: Database,
  token: string,
  now = new Date(),
): { message: string; changed: boolean; direction?: 'in' | 'out'; studentName?: string } {
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
  if (
    db.visits.some(
      (v) =>
        v.studentId === student.id &&
        v.closedAt &&
        !v.departureVerified &&
        !(
          db.schemaVersion === 3 &&
          v.events?.some((e) => e.kind === 'administrative-close' && e.at === v.closedAt)
        ),
    )
  )
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
  return { ...result, direction, studentName: student.name };
}
