import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { choices, isOpenVisit, type Database, type Staff } from './model';
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const observationInput = z
  .object({
    kind: z.literal('observation'),
    studentId: z.string(),
    choices: z.array(z.enum(choices)).max(8),
    text: z.string().trim().max(1200).default(''),
    followUp: z.boolean(),
    subject: z.enum(['Math', 'Reading']).nullable().optional(),
  })
  .refine(
    (v) => v.choices.length > 0 || v.text.length > 0,
    'Choose an observation or write a note.',
  );
export const commandInput = z.discriminatedUnion('kind', [
  observationInput,
  z.object({ kind: z.literal('review'), id: z.string() }),
  z.object({
    kind: z.literal('homework'),
    studentId: z.string(),
    description: z.string().trim().min(1).max(240),
  }),
  z.object({
    kind: z.literal('homework-status'),
    id: z.string(),
    status: z.enum(['assigned', 'prepared', 'handed-off']),
  }),
  z.object({
    kind: z.literal('attendance'),
    studentId: z.string(),
    direction: z.enum(['in', 'out']),
  }),
]);
export type Command = z.infer<typeof commandInput>;
export function attendance(
  db: Database,
  studentId: string,
  direction: 'in' | 'out',
  now = new Date(),
  actor = 'Staff',
) {
  if (!db.students.some((s) => s.id === studentId))
    throw new DomainError('Student not found.', 404);
  if (db.operations?.students[studentId]?.active === false)
    throw new DomainError('This student is inactive. Reactivate before check-in.');
  const active = db.visits.find((v) => v.studentId === studentId && isOpenVisit(v));
  if (direction === 'in') {
    if (active) return { message: 'Already checked in.', changed: false };
    db.visits.push({
      id: randomUUID(),
      studentId,
      arrivedAt: now.toISOString(),
      departedAt: null,
      events: [{ at: now.toISOString(), kind: 'arrival', actor }],
    });
    return { message: 'You’re checked in. Welcome!', changed: true };
  }
  if (!active) return { message: 'Already checked out.', changed: false };
  active.departedAt = now.toISOString();
  active.departureVerified = true;
  active.events ??= [];
  active.events.push({ at: now.toISOString(), kind: 'staff-departure', actor });
  return { message: 'You’re checked out. See you next time!', changed: true };
}
export function applyCommand(db: Database, command: Command, staff: Staff, now = new Date()) {
  const at = now.toISOString();
  let entityId = '';
  if (command.kind === 'observation' || command.kind === 'review') {
    if (staff.role === 'assistant')
      throw new DomainError('An instructor must record or review observations.', 403);
  }
  if ('studentId' in command && !db.students.some((s) => s.id === command.studentId))
    throw new DomainError('Student not found.', 404);
  if (command.kind === 'observation') {
    entityId = randomUUID();
    db.observations.push({
      id: entityId,
      studentId: command.studentId,
      visitId:
        db.visits.find((v) => v.studentId === command.studentId && isOpenVisit(v))?.id ?? null,
      choices: [...new Set(command.choices)],
      text: command.text,
      followUp: command.followUp,
      createdAt: at,
      author: staff.name,
      reviewedAt: null,
      reviewedBy: null,
      subject: command.subject ?? null,
    });
  } else if (command.kind === 'review') {
    const note = db.observations.find((o) => o.id === command.id);
    if (!note) throw new DomainError('Observation not found.', 404);
    if (!note.reviewedAt) {
      note.reviewedAt = at;
      note.reviewedBy = staff.name;
    }
    entityId = note.id;
  } else if (command.kind === 'homework') {
    entityId = randomUUID();
    db.homework.push({
      id: entityId,
      studentId: command.studentId,
      description: command.description,
      status: 'assigned',
      createdAt: at,
      updatedAt: at,
    });
  } else if (command.kind === 'homework-status') {
    const hw = db.homework.find((h) => h.id === command.id);
    if (!hw) throw new DomainError('Homework not found.', 404);
    const order = ['assigned', 'prepared', 'handed-off'];
    if (order.indexOf(command.status) < order.indexOf(hw.status))
      throw new DomainError('A handed-off packet cannot be moved backwards. Assign a new packet.');
    hw.status = command.status;
    hw.updatedAt = at;
    entityId = hw.id;
  } else {
    attendance(db, command.studentId, command.direction, now, staff.name);
    entityId = command.studentId;
  }
  db.audit.push({ id: randomUUID(), action: command.kind, actor: staff.name, at, entityId });
}
