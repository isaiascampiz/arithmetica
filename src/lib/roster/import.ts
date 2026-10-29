import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from '../domain';
import type { Database, Staff, Student } from '../model';
import { pendingStudentSettings, pendingSubject } from '../student-setup';
import { dateInput } from '../v2-domain';

const row = z.number().int().min(2).max(10001);
const sourceRows = z.array(row).min(1).max(10000);
const subject = z
  .object({
    subject: z.enum(['Math', 'Reading']),
    level: z.string().trim().max(20),
    enrollmentDate: dateInput,
    modality: z.null(),
    worksheetPosition: z.null(),
    dailyWorksheets: z.null(),
    setupState: z.literal('pending'),
  })
  .strict();
export const pendingRosterInput = z
  .object({
    format: z.enum(['centerflow-pending-roster', 'arithmetica-pending-roster']),
    version: z.literal(1),
    batchRequestId: z.uuid(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceSheet: z.string().min(1).max(100),
    reviewedAsOf: dateInput,
    productionImportReady: z.literal(false),
    policy: z
      .object({
        excludedSubjects: z.tuple([z.literal('EFL')]),
        excludedColumns: z.tuple([z.literal('ASHR'), z.literal('ST1'), z.literal('ST2')]),
        identityMatch: z.literal('normalized-first-last-and-exact-dob'),
        birthDateExported: z.literal(false),
      })
      .strict(),
    profiles: z
      .array(
        z
          .object({
            intakeId: z.uuid(),
            firstName: z.string().trim().min(1).max(120),
            lastName: z.string().trim().min(1).max(120),
            grade: z.string().max(40),
            enrollmentDate: dateInput.nullable(),
            sourceRows,
            subjects: z.array(subject).max(2),
            visitDays: z.null(),
            setupState: z.literal('pending'),
          })
          .strict(),
      )
      .min(1)
      .max(2000),
    excludedSubjectRows: z
      .array(z.object({ row, subject: z.literal('EFL'), enrollmentDate: dateInput }).strict())
      .max(10000),
    unresolvedEnrollmentDateRows: z.array(row).max(10000),
  })
  .strict();

export function assertRosterDestination(
  roster: z.infer<typeof pendingRosterInput>,
  environment: string | undefined,
) {
  if (environment === 'production') return;
  if (
    environment === 'staging' &&
    roster.sourceSheet === 'Fictional source' &&
    roster.profiles.every((profile) => profile.firstName.startsWith('Fictional'))
  )
    return;
  throw new DomainError(
    'Real rosters require the configured production workspace. Staging accepts synthetic intake only.',
    409,
  );
}

export function prepareRosterImport(input: unknown, now = new Date()) {
  const request = z
    .object({ expectedRevision: z.number().int().min(0), roster: pendingRosterInput })
    .strict()
    .parse(input);
  const ids = request.roster.profiles.map((profile) => profile.intakeId);
  const rows = request.roster.profiles.flatMap((profile) => profile.sourceRows);
  if (new Set(ids).size !== ids.length || new Set(rows).size !== rows.length)
    throw new DomainError(
      'Duplicate intake identities or source rows. Review the original workbook.',
    );
  if (
    request.roster.profiles.some(
      (profile) =>
        `${profile.firstName} ${profile.lastName}`.length > 120 ||
        new Set(profile.subjects.map((s) => s.subject)).size !== profile.subjects.length,
    )
  )
    throw new DomainError(
      'Invalid profile name or repeated subject. Review the original workbook.',
    );
  if (
    request.roster.excludedSubjectRows.some((item) => !rows.includes(item.row)) ||
    request.roster.unresolvedEnrollmentDateRows.some((item) => !rows.includes(item))
  )
    throw new DomainError('Intake references source rows outside this batch.');
  // Allocate all random identities and fix time before the retryable repository callback.
  const students: Student[] = request.roster.profiles.map((profile) => ({
    id: profile.intakeId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    name: `${profile.firstName} ${profile.lastName}`,
    initials: `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase(),
    color: 'blue',
    earlyLearner: false,
    subjects: profile.subjects.map((item) => item.subject),
    level: profile.subjects[0]?.level || '',
    token: `AR-${randomUUID()}`,
  }));
  return {
    ...request,
    students,
    at: now.toISOString(),
    auditId: randomUUID(),
    fingerprint: createHash('sha256').update(JSON.stringify(request.roster)).digest('hex'),
  };
}

export function applyRosterImport(
  db: Database,
  prepared: ReturnType<typeof prepareRosterImport>,
  staff: Staff,
) {
  if (staff.role !== 'owner') throw new DomainError('Only the owner can import a roster.', 403);
  const op = db.operations;
  if (db.schemaVersion !== 3 || !op?.v3 || op.v3.dataMode !== 'production')
    throw new DomainError('Initialize a separate production center before importing records.', 409);
  const prior = op.v3.rosterImports?.[prepared.roster.batchRequestId];
  if (prior) {
    if (prior.fingerprint !== prepared.fingerprint)
      throw new DomainError('This batch ID was already used for different data.', 409);
    return { imported: prior.studentIds.length, duplicate: true };
  }
  if (
    Object.values(op.v3.rosterImports || {}).some(
      (record) => record.sourceSha256 === prepared.roster.sourceSha256,
    )
  )
    throw new DomainError(
      'This source workbook was already imported. No students were duplicated.',
      409,
    );
  if (db.revision !== prepared.expectedRevision)
    throw new DomainError('Center records changed. Reload before importing.', 409);
  if (
    db.students.length ||
    Object.keys(op.students).length ||
    db.visits.length ||
    db.observations.length ||
    db.homework.length ||
    op.assignments.length ||
    op.completions.length ||
    op.configHistory.length ||
    op.reports.length ||
    op.families.length ||
    op.scheduleEvents.length ||
    op.classwork.length ||
    op.corrections.length ||
    op.evaluations.length ||
    op.decisions.length ||
    op.achievements.length ||
    op.appointments.length ||
    op.assistance.length ||
    op.coverage.length
  )
    throw new DomainError(
      'The first roster import requires a clean, empty production center. Existing records were preserved.',
      409,
    );
  const configs = Object.fromEntries(
    prepared.roster.profiles.map((profile) => {
      const config = pendingStudentSettings(op.center.expectedMinutes, new Date(prepared.at));
      config.grade = profile.grade || null;
      config.enrollmentDate = profile.enrollmentDate;
      config.intake = {
        version: 1,
        batchRequestId: prepared.roster.batchRequestId,
        sourceSha256: prepared.roster.sourceSha256,
        sourceRows: [...profile.sourceRows],
        subjectEnrollmentDates: {},
      };
      for (const item of profile.subjects) {
        config.subjects[item.subject] = pendingSubject(item.level, true);
        config.intake.subjectEnrollmentDates[item.subject] = item.enrollmentDate;
      }
      return [profile.intakeId, config];
    }),
  );
  db.students.push(...structuredClone(prepared.students));
  Object.assign(op.students, configs);
  for (const student of prepared.students)
    op.configHistory.push({
      studentId: student.id,
      at: prepared.at,
      name: student.name,
      subjects: structuredClone(configs[student.id].subjects),
      settings: structuredClone(configs[student.id]),
    });
  (op.v3.rosterImports ??= {})[prepared.roster.batchRequestId] = {
    fingerprint: prepared.fingerprint,
    sourceSha256: prepared.roster.sourceSha256,
    studentIds: prepared.students.map((student) => student.id),
    at: prepared.at,
    actor: staff.name,
  };
  db.audit.push({
    id: prepared.auditId,
    action: 'roster-import:pending-setup',
    actor: staff.name,
    at: prepared.at,
    entityId: prepared.roster.batchRequestId,
  });
  return { imported: prepared.students.length, duplicate: false };
}
