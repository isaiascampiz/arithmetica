import { randomUUID } from 'node:crypto';

/** Fictional intake only; never reads the owner's workbook or staged private roster. */
export function fictionalPendingRoster() {
  return {
    format: 'arithmetica-pending-roster',
    version: 1,
    batchRequestId: randomUUID(),
    sourceSha256: 'a'.repeat(64),
    sourceSheet: 'Fictional source',
    reviewedAsOf: '2026-10-28',
    productionImportReady: false,
    policy: {
      excludedSubjects: ['EFL'],
      excludedColumns: ['ASHR', 'ST1', 'ST2'],
      identityMatch: 'normalized-first-last-and-exact-dob',
      birthDateExported: false,
    },
    profiles: [
      {
        intakeId: randomUUID(),
        firstName: 'Fictional',
        lastName: 'Import Student',
        grade: 'K',
        enrollmentDate: '2026-10-01',
        sourceRows: [2, 3],
        visitDays: null,
        setupState: 'pending',
        subjects: (['Math', 'Reading'] as const).map((subject) => ({
          subject,
          level: subject === 'Math' ? '4A' : 'BII',
          enrollmentDate: '2026-10-01',
          modality: null,
          worksheetPosition: null,
          dailyWorksheets: null,
          setupState: 'pending',
        })),
      },
    ],
    excludedSubjectRows: [],
    unresolvedEnrollmentDateRows: [],
  };
}
