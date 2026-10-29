import ExcelJS from 'exceljs';
import { createHash, randomUUID } from 'node:crypto';

const headers = [
  'Subject',
  'Last Name',
  'First Name',
  'DOB',
  'Grade',
  'Level',
  'ASHR',
  'ST1',
  'ST2',
  'Enroll',
  'Worksheet/#of Worksheets',
];

type Issue = { code: string; rows: number[] };
const rosterText = (value: ExcelJS.CellValue) =>
  typeof value === 'string' ? value.trim().normalize('NFKC').replace(/\s+/g, ' ') : '';
function excelDate(value: ExcelJS.CellValue, date1904: boolean): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    const iso = value.toISOString();
    return /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(iso) ? iso.slice(0, 10) : null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2958465)
    return null;
  if (!date1904 && value === 60) return null; // Excel's fictitious leap day.
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const days = value - (!date1904 && value > 60 ? 1 : 0);
  const iso = new Date(epoch + days * 86400000).toISOString();
  return /^\d{4}-\d{2}-\d{2}T/.test(iso) ? iso.slice(0, 10) : null;
}
export type RosterPreview = {
  mode: 'review-only';
  productionImportReady: false;
  sourceSha256: string;
  rowCount: number;
  candidateStudentCount: number;
  subjectCounts: Record<string, number>;
  issues: Issue[];
  missingLaunchFields: string[];
};

// No repository, configuration, network or persistence dependency belongs in intake review.
// Names and dates are used in memory for comparison and never returned in the report.
export async function previewRoster(
  bytes: Buffer,
  asOf: string,
  sheetName?: string,
): Promise<RosterPreview> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
    !Number.isFinite(Date.parse(asOf)) ||
    new Date(asOf).toISOString().slice(0, 10) !== asOf
  )
    throw new Error('Supply a valid review date as YYYY-MM-DD.');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new Error('Workbook must be nonempty and at most 5 MiB.');
  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS reads typed cell values; formulas and external links are never evaluated.
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new Error('Cannot read this XLSX workbook. No records were changed.');
  }
  if (!sheetName && workbook.worksheets.length !== 1)
    throw new Error('Select an explicit sheet when a workbook has multiple sheets.');
  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!sheet || sheet.rowCount > 10001 || sheet.columnCount > 11)
    throw new Error('Expected one roster sheet with at most 10,000 data rows and 11 columns.');
  if (
    headers.some(
      (header, i) =>
        sheet
          .getCell(1, i + 1)
          .value?.toString()
          .trim() !== header,
    )
  )
    throw new Error('Roster headings differ from the reviewed template. Review the mapping first.');
  const issues = new Map<string, Set<number>>();
  const add = (code: string, ...rows: number[]) => {
    const set = issues.get(code) ?? new Set<number>();
    rows.forEach((row) => set.add(row));
    issues.set(code, set);
  };
  const date = (value: ExcelJS.CellValue) =>
    excelDate(value, workbook.properties.date1904 === true);
  const candidates = new Map<
    string,
    { rows: number[]; grade: string; enrollments: Set<string>; subjects: Map<string, number> }
  >();
  const nameDates = new Map<string, { dates: Set<string>; rows: number[] }>();
  const subjectCounts: Record<string, number> = {};
  let rowCount = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const cells = headers.map((_, c) => sheet.getCell(r, c + 1).value);
    if (cells.every((v) => v === null || v === undefined || v === '')) continue;
    rowCount++;
    if (cells.some((v) => v !== null && typeof v === 'object' && !(v instanceof Date))) {
      add('unsupported-cell-value-or-formula', r);
      continue;
    }
    const [subject, last, first, , , level, , status, secondaryStatus] = cells.map(rosterText);
    if (subject === 'Math' || subject === 'Reading')
      subjectCounts[subject] = (subjectCounts[subject] ?? 0) + 1;
    else {
      subjectCounts.Other = (subjectCounts.Other ?? 0) + 1;
      add('unmapped-subject', r);
    }
    if (!first || !last) {
      add('missing-student-name', r);
      continue;
    }
    if (`${first} ${last}`.length > 120) add('name-exceeds-profile-limit', r);
    if (!level) add('missing-level', r);
    if (level) add('level-catalog-confirmation-required', r);
    const dob = date(cells[3]);
    const enrollment = date(cells[9]);
    if (!dob || dob > asOf) add('invalid-or-future-birth-date', r);
    if (!enrollment) add('invalid-enrollment-date', r);
    else if (enrollment > asOf) add('future-enrollment-date', r);
    if (dob && enrollment && enrollment < dob) add('enrollment-before-birth', r);
    const grade = typeof cells[4] === 'number' ? String(cells[4]) : rosterText(cells[4]);
    if (!/^(PK1|PK2|K|[1-9]|1[0-2])$/.test(grade)) add('unmapped-school-grade', r);
    if (status || secondaryStatus) add('status-mapping-required', r);
    if (!status) add('missing-enrollment-status', r);
    if (cells[6] !== null && cells[6] !== '') add('ashr-not-completion-evidence', r);
    if (cells[10] === null || cells[10] === '') add('missing-worksheet-position', r);
    else add('worksheet-semantics-unconfirmed', r);
    const nameKey = JSON.stringify([last.toLocaleLowerCase('en'), first.toLocaleLowerCase('en')]);
    const names = nameDates.get(nameKey) ?? { dates: new Set<string>(), rows: [] };
    names.dates.add(dob ?? `invalid-row-${r}`);
    names.rows.push(r);
    nameDates.set(nameKey, names);
    // Same names alone do not identify a child. Missing DOB never merges two rows.
    const identity = JSON.stringify([nameKey, dob ?? `invalid-row-${r}`]);
    const candidate = candidates.get(identity) ?? {
      rows: [],
      grade,
      enrollments: new Set<string>(),
      subjects: new Map<string, number>(),
    };
    candidate.rows.push(r);
    if (candidate.grade !== grade) add('conflicting-student-grade', ...candidate.rows);
    if (enrollment) candidate.enrollments.add(enrollment);
    const previousSubject = candidate.subjects.get(subject);
    if (previousSubject !== undefined) add('duplicate-student-subject', previousSubject, r);
    else candidate.subjects.set(subject, r);
    candidates.set(identity, candidate);
  }
  for (const names of nameDates.values())
    if (names.dates.size > 1) add('same-name-different-or-invalid-birth-date', ...names.rows);
  for (const candidate of candidates.values())
    if (candidate.enrollments.size > 1) add('subject-enrollment-dates-differ', ...candidate.rows);
  if (!rowCount) throw new Error('Roster contains no data rows.');
  return {
    mode: 'review-only',
    productionImportReady: false,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    rowCount,
    candidateStudentCount: candidates.size,
    subjectCounts,
    issues: [...issues]
      .map(([code, rows]) => ({ code, rows: [...rows].sort((a, b) => a - b) }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    missingLaunchFields: [
      'confirmed-active-enrollment',
      'subject-mapping',
      'per-subject-paper-or-connect',
      'visit-days',
      'confirmed-level-catalog-and-worksheet-position',
    ],
  };
}

type IntakeSubject = {
  subject: 'Math' | 'Reading';
  level: string;
  enrollmentDate: string;
  modality: null;
  worksheetPosition: null;
  dailyWorksheets: null;
  setupState: 'pending';
};
type IntakeProfile = {
  intakeId: string;
  firstName: string;
  lastName: string;
  grade: string;
  enrollmentDate: string | null;
  sourceRows: number[];
  subjects: IntakeSubject[];
  visitDays: null;
  setupState: 'pending';
};

// A private handoff artifact, deliberately distinct from Database/StudentSettings.
// It cannot be provisioned as a backup or passed to existing student-save commands.
export async function stageRoster(bytes: Buffer, asOf: string, sheetName?: string) {
  const preview = await previewRoster(bytes, asOf, sheetName);
  const blockers = new Set([
    'unsupported-cell-value-or-formula',
    'missing-student-name',
    'name-exceeds-profile-limit',
    'invalid-or-future-birth-date',
    'invalid-enrollment-date',
    'future-enrollment-date',
    'enrollment-before-birth',
    'conflicting-student-grade',
    'duplicate-student-subject',
    'same-name-different-or-invalid-birth-date',
    'unmapped-school-grade',
  ]);
  if (preview.issues.some((issue) => blockers.has(issue.code)))
    throw new Error(
      'Resolve blocking row issues with roster:preview before staging. No profiles were saved.',
    );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
  const sheet = sheetName ? book.getWorksheet(sheetName)! : book.worksheets[0];
  const profiles = new Map<string, IntakeProfile>();
  const enrollmentDates = new Map<string, Set<string>>();
  const excludedSubjectRows: { row: number; subject: 'EFL'; enrollmentDate: string }[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const values = headers.map((_, c) => sheet.getCell(r, c + 1).value);
    if (values.every((v) => v === null || v === undefined || v === '')) continue;
    const [subject, lastName, firstName] = values.map(rosterText);
    if (!['Math', 'Reading', 'EFL'].includes(subject))
      throw new Error('Unreviewed subject mapping. No profiles were saved.');
    const dob = excelDate(values[3], book.properties.date1904 === true)!;
    const enrollmentDate = excelDate(values[9], book.properties.date1904 === true)!;
    const key = JSON.stringify([
      lastName.toLocaleLowerCase('en'),
      firstName.toLocaleLowerCase('en'),
      dob,
    ]);
    const profile = profiles.get(key) ?? {
      intakeId: randomUUID(),
      firstName,
      lastName,
      grade: typeof values[4] === 'number' ? String(values[4]) : rosterText(values[4]),
      enrollmentDate,
      sourceRows: [],
      subjects: [],
      visitDays: null,
      setupState: 'pending',
    };
    profile.sourceRows.push(r);
    const dates = enrollmentDates.get(key) ?? new Set<string>();
    dates.add(enrollmentDate);
    enrollmentDates.set(key, dates);
    if (dates.size > 1) profile.enrollmentDate = null;
    if (subject === 'EFL') excludedSubjectRows.push({ row: r, subject, enrollmentDate });
    else
      profile.subjects.push({
        subject: subject as 'Math' | 'Reading',
        level: rosterText(values[5]),
        enrollmentDate,
        modality: null,
        worksheetPosition: null,
        dailyWorksheets: null,
        setupState: 'pending',
      });
    profiles.set(key, profile);
  }
  return {
    format: 'arithmetica-pending-roster' as const,
    version: 1 as const,
    batchRequestId: randomUUID(),
    sourceSha256: preview.sourceSha256,
    sourceSheet: sheet.name,
    reviewedAsOf: asOf,
    productionImportReady: false as const,
    policy: {
      excludedSubjects: ['EFL'],
      excludedColumns: ['ASHR', 'ST1', 'ST2'],
      identityMatch: 'normalized-first-last-and-exact-dob',
      birthDateExported: false,
    },
    profiles: [...profiles.values()],
    excludedSubjectRows,
    unresolvedEnrollmentDateRows:
      preview.issues.find((issue) => issue.code === 'subject-enrollment-dates-differ')?.rows ?? [],
  };
}
