import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from './domain';
import { dayKey, isOpenVisit, type Database, type Staff } from './model';
import { defaultStudentSettings, operations } from './migrate';
import {
  activeCorrections,
  numbers,
  planHomework,
  refreshProposals,
  assignmentSnapshot,
} from './homework';
import { assignmentStatuses, dimensions, type AssignmentStatus, type Subject } from './v2-model';
import { lastVisitBeforeVacation, weekday } from './schedule';
export const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (d) =>
      !Number.isNaN(Date.parse(d + 'T12:00:00Z')) &&
      new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d,
    'Enter a valid date.',
  );
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const subject = z.enum(['Math', 'Reading']);
const reason = z.string().trim().min(3).max(1200);
const days = z.array(z.number().int().min(0).max(6)).max(7);
const range = z
  .object({
    level: z.string().trim().min(1).max(20),
    start: z.number().int().min(1).max(10000),
    end: z.number().int().min(1).max(10000),
  })
  .refine(
    (r) => r.end >= r.start && r.end - r.start < 1000,
    'Worksheet range must be ordered and less than 1,000 sheets.',
  );
export const subjectSettingsInput = z
  .object({
    enrolled: z.boolean(),
    format: z.enum(['Paper', 'CONNECT']),
    level: z.string().trim().min(1).max(20),
    currentStart: z.number().int().min(1).max(10000),
    currentEnd: z.number().int().min(1).max(10000),
    nextStart: z.number().int().min(1).max(10000),
    packetsPerDay: z.number().int().min(0).max(10),
    sheetsPerPacket: z.number().int().min(1).max(100),
    classworkSheets: z.number().int().min(1).max(100),
    excludeDays: days,
    maxDays: z.number().int().min(1).max(90),
    maxSheets: z.number().int().min(1).max(1000),
  })
  .refine((s) => s.currentEnd >= s.currentStart, 'Current worksheet range must be ordered.');
export const studentSettingsInput = z.object({
  grade: z.string().trim().max(40).nullable().optional(),
  version: z.number().int().min(1),
  active: z.boolean(),
  familyId: z.string().nullable(),
  recurringDays: days,
  individualSchedule: z.boolean(),
  expectedMinutes: z.number().int().min(5).max(240),
  expectedMinutesOverride: z.boolean().optional(),
  subjects: z.object({ Math: subjectSettingsInput, Reading: subjectSettingsInput }),
  updatedAt: z.string(),
});
export const v2CommandInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('student-add'),
    name: z.string().trim().min(2).max(120),
    earlyLearner: z.boolean(),
  }),
  z.object({
    action: z.literal('student-save'),
    studentId: z.string(),
    name: z.string().trim().min(2).max(120),
    earlyLearner: z.boolean(),
    settings: studentSettingsInput,
  }),
  z.object({ action: z.literal('student-active'), studentId: z.string(), active: z.boolean() }),
  z.object({ action: z.literal('qr-reissue'), studentId: z.string(), reason }),
  z.object({
    action: z.literal('family-save'),
    id: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    recurringDays: days,
  }),
  z.object({
    action: z.literal('schedule-add'),
    studentId: z.string().nullable(),
    familyId: z.string().nullable(),
    kind: z.enum(['absence', 'vacation', 'extra-visit', 'move-visit']),
    start: dateInput,
    end: dateInput,
    returnDate: dateInput.nullable(),
    reason,
  }),
  z.object({ action: z.literal('schedule-cancel'), id: z.string(), reason }),
  z.object({ action: z.literal('assistance'), studentId: z.string(), reason }),
  z.object({
    action: z.literal('assistance-status'),
    id: z.string(),
    state: z.enum(['helping', 'resolved']),
  }),
  z.object({
    action: z.literal('visit-reconcile'),
    id: z.string(),
    mode: z.enum(['verify', 'reopen']),
    departedAt: z.string().optional(),
    reason,
  }),
  z.object({ action: z.literal('correction-add'), studentId: z.string(), subject, range, reason }),
  z.object({
    action: z.literal('correction-update'),
    id: z.string(),
    remaining: z.array(z.number().int()).max(1000),
    state: z.enum(['partial', 'deferred', 'complete']),
    reason,
  }),
  z.object({
    action: z.literal('classwork'),
    workedDate: dateInput.optional(),
    studentId: z.string(),
    subject,
    range,
    completed: z.array(z.number().int()).max(1000),
    officialCount: z.number().int().min(0).max(1000).nullable().optional(),
  }),
  z.object({
    action: z.literal('plan'),
    studentId: z.string(),
    subject,
    fromDate: dateInput,
    carryIds: z.array(z.string()).max(20).default([]),
  }),
  z.object({
    action: z.literal('classwork-update'),
    id: z.string(),
    completed: z.array(z.number().int()).max(1000),
    officialCount: z.number().int().min(0).max(1000).nullable(),
    reason,
  }),
  z.object({ action: z.literal('plan-batch'), fromDate: dateInput }),
  z.object({
    action: z.literal('assignment-status'),
    id: z.string(),
    status: z.enum(assignmentStatuses),
    reason: z.string().trim().max(1200).default(''),
    correcting: z.boolean().default(false),
  }),
  z.object({ action: z.literal('assignment-refresh'), id: z.string(), reason }),
  z.object({
    action: z.literal('completion'),
    completedDate: dateInput.optional(),
    id: z.string(),
    worksheets: z.array(z.number().int()).min(1).max(1000),
    level: z.string().trim().min(1).max(20).optional(),
    officialCount: z.number().int().min(0).max(1000).nullable(),
    partial: z.boolean(),
    reason,
  }),
  z.object({
    action: z.literal('evaluation'),
    studentId: z.string(),
    subject,
    ratings: z.record(
      z.enum(dimensions),
      z.enum(['Not assessed', 'Needs support', 'Developing', 'Secure']),
    ),
    text: z.string().trim().max(1200),
    followUp: z.boolean(),
  }),
  z.object({
    action: z.literal('decision'),
    studentId: z.string(),
    subject,
    kind: z.enum(['continue', 'repeat-range', 'repeat-from', 'advance', 'review']),
    range,
    note: reason,
  }),
  z.object({ action: z.literal('decision-approve'), id: z.string() }),
  z.object({
    action: z.literal('achievement'),
    studentId: z.string(),
    subject,
    distinction: z.enum(['Bronze', 'Silver', 'Gold', 'Platinum']),
    date: dateInput,
    evidence: z.string().trim().max(1200).default(''),
  }),
  z.object({
    action: z.literal('appointment-save'),
    id: z.string().optional(),
    version: z.number().int().optional(),
    title: z.string().trim().min(1).max(120),
    staffId: z.string(),
    startsAt: z.string().datetime(),
    minutes: z.number().int().min(10).max(180),
    notes: z.string().trim().max(1200),
    status: z.enum(['scheduled', 'cancelled']),
  }),
  z.object({
    action: z.literal('coverage-save'),
    id: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    role: z.enum(['instructor', 'grader']),
    days,
    start: clock,
    end: clock,
  }),
  z.object({
    action: z.literal('center-save'),
    name: z.string().trim().min(1).max(100),
    operatingDays: days,
    closedDates: z.array(dateInput).max(100),
    closingTime: clock,
    reportTime: clock,
    autoClose: z.boolean(),
    expectedMinutes: z.number().int().min(5).max(240),
    earlyPerInstructor: z.number().int().min(1).max(10),
  }),
]);
export type V2Command = z.infer<typeof v2CommandInput>;
function teacher(staff: Staff) {
  if (staff.role === 'assistant')
    throw new DomainError('An instructor must approve or change instructional records.', 403);
}
const workflow: Partial<Record<AssignmentStatus, AssignmentStatus[]>> = {
  'decision-needed': ['proposed'],
  proposed: ['approved', 'deferred'],
  approved: ['ready', 'deferred'],
  ready: ['pulled', 'deferred'],
  pulled: ['distributed', 'deferred'],
  distributed: ['returned', 'partial', 'corrections-outstanding', 'deferred'],
  returned: ['partial', 'corrections-outstanding', 'deferred'],
  partial: ['returned', 'corrections-outstanding', 'deferred'],
  'corrections-outstanding': ['returned', 'deferred'],
  repeated: ['ready'],
  deferred: ['proposed'],
};
export function applyV2(db: Database, c: V2Command, staff: Staff, now = new Date()) {
  const op = operations(db),
    at = now.toISOString();
  let entityId = '';
  const protectedActions = [
    'student-add',
    'student-save',
    'student-active',
    'qr-reissue',
    'visit-reconcile',
    'correction-add',
    'correction-update',
    'classwork',
    'classwork-update',
    'evaluation',
    'decision',
    'decision-approve',
    'achievement',
    'completion',
    'assignment-refresh',
  ];
  if (protectedActions.includes(c.action)) teacher(staff);
  if ('studentId' in c && c.studentId && !db.students.some((s) => s.id === c.studentId))
    throw new DomainError('Student not found.', 404);
  if (c.action === 'student-add') {
    entityId = randomUUID();
    const s = {
      id: entityId,
      name: c.name,
      initials: c.name
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase(),
      color: 'blue',
      earlyLearner: c.earlyLearner,
      subjects: ['Math'],
      level: '4A',
      token: `CF-${randomUUID()}`,
    };
    db.students.push(s);
    op.students[s.id] = defaultStudentSettings(s, now);
    op.students[s.id].expectedMinutes = op.center.expectedMinutes;
    op.configHistory.push({
      studentId: s.id,
      at,
      subjects: structuredClone(op.students[s.id].subjects),
      name: s.name,
      settings: structuredClone(op.students[s.id]),
    });
  } else if (c.action === 'student-save') {
    const s = db.students.find((s) => s.id === c.studentId)!;
    const old = op.students[s.id];
    if (op.v3 && c.settings.recurringDays.some((d) => d < 1 || d > 4))
      throw new DomainError('Regular visits are Monday–Thursday only.');
    if (old.version !== c.settings.version)
      throw new DomainError(
        'This profile changed on another device. Reload the profile before saving.',
        409,
      );
    if (c.settings.familyId && !op.families.some((f) => f.id === c.settings.familyId))
      throw new DomainError('Family no longer exists.');
    if (!c.settings.subjects.Math.enrolled && !c.settings.subjects.Reading.enrolled)
      throw new DomainError('Enroll at least one subject.');
    op.students[s.id] = {
      ...old,
      ...c.settings,
      expectedMinutesOverride:
        c.settings.expectedMinutesOverride ??
        (c.settings.expectedMinutes !== old.expectedMinutes ||
          Boolean(old.expectedMinutesOverride)),
      version: old.version + 1,
      updatedAt: at,
    };
    s.name = c.name;
    s.initials = c.name
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase();
    s.earlyLearner = c.earlyLearner;
    s.subjects = (['Math', 'Reading'] as Subject[]).filter((x) => c.settings.subjects[x].enrolled);
    s.level = c.settings.subjects[s.subjects[0] as Subject].level;
    op.configHistory.push({
      studentId: s.id,
      at,
      subjects: structuredClone(c.settings.subjects),
      name: s.name,
      settings: structuredClone(op.students[s.id]),
    });
    entityId = s.id;
  } else if (c.action === 'student-active') {
    if (!c.active && db.visits.some((v) => v.studentId === c.studentId && isOpenVisit(v)))
      throw new DomainError('Reconcile the open attendance visit before withdrawing this student.');
    op.students[c.studentId].active = c.active;
    op.students[c.studentId].version++;
    op.configHistory.push({
      studentId: c.studentId,
      at,
      name: db.students.find((s) => s.id === c.studentId)!.name,
      settings: structuredClone(op.students[c.studentId]),
      subjects: structuredClone(op.students[c.studentId].subjects),
    });
    entityId = c.studentId;
  } else if (c.action === 'qr-reissue') {
    const s = db.students.find((s) => s.id === c.studentId)!;
    s.token = `CF-${randomUUID()}`;
    entityId = s.id;
  } else if (c.action === 'family-save') {
    entityId = c.id || randomUUID();
    const f = op.families.find((f) => f.id === entityId);
    if (f) Object.assign(f, { name: c.name, recurringDays: [...new Set(c.recurringDays)] });
    else
      op.families.push({
        id: entityId,
        name: c.name,
        recurringDays: [...new Set(c.recurringDays)],
      });
  } else if (c.action === 'schedule-add') {
    if (Boolean(c.studentId) === Boolean(c.familyId))
      throw new DomainError('Choose one student or one family.');
    if (c.familyId && !op.families.some((f) => f.id === c.familyId))
      throw new DomainError('Family not found.');
    if (c.end < c.start) throw new DomainError('End date precedes start date.');
    if (
      c.kind === 'move-visit' &&
      (!c.returnDate || (c.returnDate >= c.start && c.returnDate <= c.end))
    )
      throw new DomainError('Choose a different return date outside the cancelled visit range.');
    const visitDay =
      c.kind === 'extra-visit' ? c.start : c.kind === 'move-visit' ? c.returnDate : null;
    if (
      visitDay &&
      (!op.center.operatingDays.includes(weekday(visitDay)) ||
        op.center.closedDates.includes(visitDay))
    )
      throw new DomainError('The requested visit is on a center closure day.');
    entityId = randomUUID();
    op.scheduleEvents.push({ ...c, id: entityId, createdAt: at, author: staff.name });
    if (c.kind === 'vacation')
      for (const s of db.students.filter(
        (s) => s.id === c.studentId || (c.familyId && op.students[s.id].familyId === c.familyId),
      )) {
        const from = lastVisitBeforeVacation(op, s.id, dayKey(now, op.center.timezone));
        if (!from) continue;
        for (const sub of ['Math', 'Reading'] as Subject[]) {
          if (
            !op.students[s.id].subjects[sub].enrolled ||
            op.assignments.some(
              (a) => a.studentId === s.id && a.subject === sub && a.fromDate === from,
            )
          )
            continue;
          const a = planHomework(db, s.id, sub, from, [], now);
          a.events.push({
            at,
            actor: 'System',
            status: a.status,
            reason:
              'Future vacation workload proposed for last expected pre-departure visit; approval required',
          });
          op.assignments.push(a);
        }
      }
  } else if (c.action === 'schedule-cancel') {
    const e = op.scheduleEvents.find((e) => e.id === c.id);
    if (!e) throw new DomainError('Schedule exception not found.');
    e.cancelledAt = at;
    entityId = e.id;
  } else if (c.action === 'assistance') {
    if (!op.assistance.some((a) => a.studentId === c.studentId && a.state !== 'resolved'))
      op.assistance.push({
        id: randomUUID(),
        studentId: c.studentId,
        reason: c.reason,
        state: 'requested',
        requestedAt: at,
        assignedTo: null,
        resolvedAt: null,
      });
    entityId = c.studentId;
  } else if (c.action === 'assistance-status') {
    const a = op.assistance.find((a) => a.id === c.id);
    if (!a) throw new DomainError('Assistance request not found.');
    a.state = c.state;
    a.assignedTo = staff.name;
    if (c.state === 'resolved') a.resolvedAt = at;
    entityId = a.id;
  } else if (c.action === 'visit-reconcile') {
    const v = db.visits.find((v) => v.id === c.id);
    if (!v) throw new DomainError('Visit not found.');
    if (c.mode === 'reopen') {
      if (
        db.visits.some(
          (other) => other.id !== v.id && other.studentId === v.studentId && isOpenVisit(other),
        )
      )
        throw new DomainError('Another visit is already open.');
      v.departedAt = null;
      delete v.closedAt;
      v.departureVerified = false;
      v.events ??= [];
      v.events.push({ at, actor: staff.name, kind: 'reopened', reason: c.reason });
    } else {
      const departure = Date.parse(c.departedAt || '');
      if (
        !Number.isFinite(departure) ||
        departure < Date.parse(v.arrivedAt) ||
        departure > now.getTime()
      )
        throw new DomainError('A verified departure must be after arrival and not in the future.');
      v.departedAt = new Date(departure).toISOString();
      v.departureVerified = true;
      v.events ??= [];
      v.events.push({
        at,
        actor: staff.name,
        kind: 'verified-correction',
        reason: c.reason,
        value: v.departedAt,
      });
    }
    entityId = v.id;
  } else if (c.action === 'correction-add') {
    entityId = randomUUID();
    op.corrections.push({
      id: entityId,
      studentId: c.studentId,
      subject: c.subject,
      range: c.range,
      remaining: numbers(c.range),
      state: 'outstanding',
      reason: c.reason,
      createdAt: at,
      updatedAt: at,
      author: staff.name,
      events: [
        {
          at,
          actor: staff.name,
          state: 'outstanding',
          remaining: numbers(c.range),
          reason: c.reason,
        },
      ],
    });
  } else if (c.action === 'correction-update') {
    const r = op.corrections.find((r) => r.id === c.id);
    if (!r) throw new DomainError('Correction not found.');
    if (c.state === 'complete' && c.remaining.length)
      throw new DomainError('Completed corrections must have no remaining worksheets.');
    if (c.state !== 'complete' && !c.remaining.length)
      throw new DomainError('Select the worksheets still requiring correction.');
    if (c.remaining.some((n) => !r.remaining.includes(n)))
      throw new DomainError(
        'Correction updates cannot add new worksheet identities. Record a new correction instead.',
      );
    r.remaining = [...new Set(c.remaining)];
    r.state = c.state;
    r.reason = c.reason;
    r.updatedAt = at;
    r.events.push({
      at,
      actor: staff.name,
      state: c.state,
      remaining: [...r.remaining],
      reason: c.reason,
    });
    entityId = r.id;
  } else if (c.action === 'classwork') {
    if (c.workedDate && c.workedDate > dayKey(now, op.center.timezone))
      throw new DomainError('Actual classwork cannot be recorded in the future.');
    if (activeCorrections(db, c.studentId, c.subject).some((r) => r.state !== 'deferred'))
      throw new DomainError(
        'Address or explicitly defer outstanding corrections before new classwork.',
      );
    if (c.completed.some((n) => !numbers(c.range).includes(n)))
      throw new DomainError('Completed sheets are outside the classwork range.');
    const visit = db.visits.find((v) => v.studentId === c.studentId && isOpenVisit(v));
    const same = op.classwork.find(
      (w) =>
        w.studentId === c.studentId &&
        w.subject === c.subject &&
        w.range.level === c.range.level &&
        w.range.start === c.range.start &&
        w.range.end === c.range.end &&
        w.visitId === (visit?.id ?? null) &&
        dayKey(w.createdAt, op.center.timezone) === dayKey(now, op.center.timezone),
    );
    if (
      same &&
      !op.decisions.some(
        (d) =>
          d.studentId === c.studentId &&
          d.subject === c.subject &&
          d.kind.startsWith('repeat') &&
          d.approvedAt &&
          d.approvedAt > same.createdAt,
      )
    )
      throw new DomainError(
        'This classwork range already has a record. Update its completion instead of duplicating it.',
      );
    entityId = randomUUID();
    op.classwork.push({
      id: entityId,
      studentId: c.studentId,
      subject: c.subject,
      range: c.range,
      completed: [...new Set(c.completed)],
      createdAt: at,
      visitId: db.visits.find((v) => v.studentId === c.studentId && isOpenVisit(v))?.id ?? null,
      carriedAssignmentId: null,
      workedDate: c.workedDate || dayKey(now, op.center.timezone),
      format: op.students[c.studentId].subjects[c.subject].format,
      events: [
        {
          at,
          actor: staff.name,
          completed: [...new Set(c.completed)],
          reason: 'Original classwork record',
        },
      ],
    });
    if (c.completed.length) {
      const verified = [...new Set(c.completed)];
      if (c.officialCount != null && c.officialCount > verified.length)
        throw new DomainError('Official count cannot exceed verified classwork sheets.');
      op.completions.push({
        id: randomUUID(),
        assignmentId: entityId,
        studentId: c.studentId,
        subject: c.subject,
        level: c.range.level,
        worksheets: verified,
        format: op.students[c.studentId].subjects[c.subject].format,
        physicalSheets:
          op.students[c.studentId].subjects[c.subject].format === 'Paper' ? verified.length : 0,
        officialCount: c.officialCount ?? null,
        verifiedBy: staff.name,
        at,
        active: true,
        reason: 'Instructor recorded exact completed in-center worksheet identities',
        completedDate: c.workedDate || dayKey(now, op.center.timezone),
      });
    }
  } else if (c.action === 'classwork-update') {
    const w = op.classwork.find((w) => w.id === c.id);
    if (!w) throw new DomainError('Classwork record not found.');
    if (w.carriedAssignmentId)
      throw new DomainError(
        'This work was already carried home. Update the distributed assignment instead.',
      );
    if (c.completed.some((n) => !numbers(w.range).includes(n)))
      throw new DomainError('Completed worksheet identities are outside this range.');
    const completed = [...new Set(c.completed)];
    if (c.officialCount !== null && c.officialCount > completed.length)
      throw new DomainError('Official count exceeds completed sheets.');
    for (const old of op.completions.filter((x) => x.assignmentId === w.id && x.active))
      old.active = false;
    w.completed = completed;
    w.events ??= [];
    w.events.push({ at, actor: staff.name, completed, reason: c.reason });
    if (completed.length)
      op.completions.push({
        id: randomUUID(),
        assignmentId: w.id,
        studentId: w.studentId,
        subject: w.subject,
        level: w.range.level,
        worksheets: completed,
        format: w.format || 'Paper',
        physicalSheets: w.format === 'CONNECT' ? 0 : completed.length,
        officialCount: c.officialCount,
        verifiedBy: staff.name,
        at,
        active: true,
        reason: c.reason,
        completedDate: w.workedDate || dayKey(w.createdAt, op.center.timezone),
      });
    entityId = w.id;
  } else if (c.action === 'plan' || c.action === 'plan-batch') {
    const students =
      c.action === 'plan'
        ? db.students.filter((s) => s.id === c.studentId)
        : db.students.filter((s) => op.students[s.id].active);
    for (const s of students)
      for (const sub of (c.action === 'plan' ? [c.subject] : ['Math', 'Reading']) as Subject[]) {
        if (!op.students[s.id].subjects[sub].enrolled) continue;
        const existing = op.assignments.find(
          (a) =>
            a.studentId === s.id &&
            a.subject === sub &&
            a.fromDate === c.fromDate &&
            ![
              'distributed',
              'returned',
              'partial',
              'verified',
              'repeated',
              'corrections-outstanding',
              'deferred',
            ].includes(a.status),
        );
        if (existing) {
          if (c.action === 'plan' && ['proposed', 'decision-needed'].includes(existing.status)) {
            const p = planHomework(db, s.id, sub, c.fromDate, c.carryIds, now);
            Object.assign(existing, {
              ...p,
              id: existing.id,
              createdAt: existing.createdAt,
              events: [
                ...existing.events,
                {
                  at,
                  actor: staff.name,
                  status: p.status,
                  reason: 'Instructor revised proposal and carryover selection',
                },
              ],
            });
          }
          entityId = existing.id;
          continue;
        }
        const a = planHomework(
          db,
          s.id,
          sub,
          c.fromDate,
          c.action === 'plan' ? c.carryIds : [],
          now,
        );
        a.events.push({
          at,
          actor: staff.name,
          status: a.status,
          reason: 'Schedule-based proposal; instructor approval required',
          snapshot: assignmentSnapshot(a),
        });
        op.assignments.push(a);
        entityId = a.id;
      }
  } else if (c.action === 'assignment-status') {
    const a = op.assignments.find((a) => a.id === c.id);
    if (!a) throw new DomainError('Assignment not found.');
    if (a.status === c.status) return a.id;
    if (
      ['approved', 'ready', 'deferred', 'repeated', 'proposed', 'decision-needed'].includes(
        c.status,
      ) ||
      c.correcting
    )
      teacher(staff);
    if (c.status === 'verified')
      throw new DomainError('Use verified completion with exact worksheet identities.');
    if (c.correcting) {
      if (c.reason.length < 3) throw new DomainError('Explain this correction.');
      for (const entry of op.completions.filter((x) => x.assignmentId === a.id && x.active))
        entry.active = false;
    } else if (
      !workflow[a.status]?.includes(c.status) &&
      !(a.status === 'ready' && a.format === 'CONNECT' && c.status === 'distributed')
    )
      throw new DomainError(`Cannot change ${a.status} directly to ${c.status}.`);
    if (['approved', 'ready', 'pulled', 'distributed'].includes(c.status)) {
      if (a.stale) throw new DomainError('Recalculate and approve the changed assignment first.');
      if (a.blocked.length) throw new DomainError(a.blocked.join('; '));
      if (a.format === 'CONNECT' && c.status === 'pulled')
        throw new DomainError('CONNECT work has no paper pull task.');
      if (a.capped && c.status === 'approved' && c.reason.length < 3)
        throw new DomainError('Explain approval of the capped absence workload.');
    }
    if (c.status === 'deferred' && c.reason.length < 3)
      throw new DomainError('Explain the deferral.');
    a.status = c.status;
    a.updatedAt = at;
    a.events.push({
      at,
      actor: staff.name,
      status: c.status,
      reason: c.reason || 'Staff workflow action',
      snapshot: assignmentSnapshot(a),
    });
    if (c.status === 'distributed') {
      for (const id of a.carryIds) {
        const w = op.classwork.find((w) => w.id === id);
        if (w) w.carriedAssignmentId = a.id;
      }
      const cfg = op.students[a.studentId].subjects[a.subject];
      const last = a.ranges.filter((r) => r.level === cfg.level).at(-1);
      if (last) cfg.nextStart = Math.max(cfg.nextStart, last.end + 1);
      op.students[a.studentId].version++;
    }
    entityId = a.id;
  } else if (c.action === 'assignment-refresh') {
    const a = op.assignments.find((a) => a.id === c.id);
    if (!a) throw new DomainError('Assignment not found.');
    if (
      ['distributed', 'returned', 'partial', 'verified', 'corrections-outstanding'].includes(
        a.status,
      )
    )
      throw new DomainError(
        'A distributed assignment is historical. Create a new proposal instead.',
      );
    const p = planHomework(db, a.studentId, a.subject, a.fromDate, a.carryIds, now);
    Object.assign(a, {
      ...p,
      id: a.id,
      createdAt: a.createdAt,
      events: [
        ...a.events,
        {
          at,
          actor: staff.name,
          status: p.status,
          reason: c.reason,
          snapshot: assignmentSnapshot(p),
        },
      ],
    });
    entityId = a.id;
  } else if (c.action === 'completion') {
    const a = op.assignments.find((a) => a.id === c.id);
    if (!a) throw new DomainError('Assignment not found.');
    if (
      c.completedDate &&
      (c.completedDate > dayKey(now, op.center.timezone) || c.completedDate < a.fromDate)
    )
      throw new DomainError(
        'Completion date must be on/after assignment planning and not in the future.',
      );
    if (!['distributed', 'returned', 'partial', 'corrections-outstanding'].includes(a.status))
      throw new DomainError('Distribute the assignment before recording returned work.');
    const all = [...a.ranges, ...a.carryRanges];
    const levels = new Set(all.map((r) => r.level));
    const level = c.level || (levels.size === 1 ? all[0].level : null);
    if (!level || !levels.has(level))
      throw new DomainError('Choose the worksheet level being verified.');
    const allowed = all.filter((r) => r.level === level).flatMap(numbers);
    if (c.worksheets.some((n) => !allowed.includes(n)))
      throw new DomainError('Completed worksheets are outside this assignment.');
    const prior = op.completions
      .filter((x) => x.assignmentId === a.id && x.active && x.level === level)
      .flatMap((x) => x.worksheets);
    const fresh = [...new Set(c.worksheets)];
    if (fresh.some((n) => prior.includes(n)))
      throw new DomainError(
        'These worksheet identities were already verified for this assignment.',
      );
    if (c.officialCount !== null && c.officialCount > fresh.length)
      throw new DomainError('Official worksheet count cannot exceed verified physical sheets.');
    const others = op.completions
      .filter((x) => x.assignmentId === a.id && x.active && x.level !== level)
      .reduce((n, x) => n + x.worksheets.length, 0);
    if (
      !c.partial &&
      new Set([...prior, ...fresh]).size + others !== all.reduce((n, r) => n + numbers(r).length, 0)
    )
      throw new DomainError('Verify every sheet, or mark this return partially completed.');
    entityId = randomUUID();
    op.completions.push({
      id: entityId,
      assignmentId: a.id,
      studentId: a.studentId,
      subject: a.subject,
      level,
      worksheets: fresh,
      format: a.format,
      physicalSheets: a.format === 'Paper' ? fresh.length : 0,
      completedDate: c.completedDate || dayKey(now, op.center.timezone),
      officialCount: c.officialCount,
      verifiedBy: staff.name,
      at,
      active: true,
      reason: c.reason,
    });
    a.status = c.partial ? 'partial' : 'verified';
    a.updatedAt = at;
    a.events.push({ at, actor: staff.name, status: a.status, reason: c.reason });
  } else if (c.action === 'evaluation') {
    entityId = randomUUID();
    op.evaluations.push({ ...c, id: entityId, createdAt: at, author: staff.name });
    if (c.followUp)
      db.observations.push({
        id: randomUUID(),
        studentId: c.studentId,
        visitId: null,
        choices: ['Review next assignment'],
        text: `${c.subject} evaluation follow-up: ${c.text || 'Review recorded ratings.'}`,
        followUp: true,
        createdAt: at,
        author: staff.name,
        reviewedAt: null,
        reviewedBy: null,
      });
  } else if (c.action === 'decision') {
    entityId = randomUUID();
    op.decisions.push({
      ...c,
      id: entityId,
      createdAt: at,
      author: staff.name,
      approvedAt: null,
      approvedBy: null,
    });
  } else if (c.action === 'decision-approve') {
    const d = op.decisions.find((d) => d.id === c.id);
    if (!d) throw new DomainError('Decision not found.');
    if (d.approvedAt) return d.id;
    if (d.kind === 'review')
      throw new DomainError(
        'Review is a pending decision. Record a concrete continue, repeat, or advance decision.',
      );
    const cfg = op.students[d.studentId].subjects[d.subject];
    cfg.level = d.range.level;
    cfg.nextStart = d.range.start;
    if (d.kind === 'repeat-range' || d.kind === 'advance') {
      cfg.currentStart = d.range.start;
      cfg.currentEnd = d.range.end;
    }
    d.approvedAt = at;
    d.approvedBy = staff.name;
    for (const prior of op.decisions.filter(
      (p) =>
        p.studentId === d.studentId &&
        p.subject === d.subject &&
        p.id !== d.id &&
        !p.approvedAt &&
        !p.supersededAt,
    ))
      prior.supersededAt = at;
    const base = db.students.find((s) => s.id === d.studentId)!;
    if (base.subjects[0] === d.subject) base.level = cfg.level;
    op.students[d.studentId].version++;
    op.configHistory.push({
      studentId: d.studentId,
      at,
      subjects: structuredClone(op.students[d.studentId].subjects),
    });
    entityId = d.id;
  } else if (c.action === 'achievement') {
    entityId = randomUUID();
    op.achievements.push({ ...c, id: entityId, verifiedBy: staff.name, createdAt: at });
  } else if (c.action === 'appointment-save') {
    if (!op.coverage.some((s) => s.id === c.staffId && s.role === 'instructor'))
      throw new DomainError('Assign an instructor from staff coverage.');
    entityId = c.id || randomUUID();
    const existing = op.appointments.find((a) => a.id === entityId);
    if (existing && c.version !== existing.version)
      throw new DomainError(
        'This orientation changed on another device. Reload before saving.',
        409,
      );
    const data = {
      ...c,
      id: entityId,
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt || at,
      updatedAt: at,
    };
    if (existing) Object.assign(existing, data);
    else op.appointments.push(data);
  } else if (c.action === 'coverage-save') {
    if (staff.role !== 'owner')
      throw new DomainError('Only the owner can configure staffing.', 403);
    if (c.end <= c.start) throw new DomainError('Coverage must end after it starts.');
    entityId = c.id || randomUUID();
    const s = op.coverage.find((s) => s.id === entityId);
    if (s) Object.assign(s, c);
    else op.coverage.push({ ...c, id: entityId });
  } else if (c.action === 'center-save') {
    if (staff.role !== 'owner')
      throw new DomainError('Only the owner can configure center settings.', 403);
    Object.assign(op.center, c);
    entityId = 'center';
  }
  refreshProposals(db, now);
  db.audit.push({ id: randomUUID(), action: c.action, actor: staff.name, at, entityId });
  return entityId;
}
