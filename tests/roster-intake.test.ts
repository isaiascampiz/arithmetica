import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { previewRoster, stageRoster } from '../src/lib/roster-intake';

const headings = [
  'Subject',
  'Last Name',
  'First Name',
  'DOB',
  'Grade',
  'Level',
  'ASHR',
  'ST1',
  'ST2',
  'Enroll ',
  'Worksheet/#of Worksheets',
];
// Fictional fixture only. No source workbook, student name or date is committed.
const row = (overrides: Record<number, ExcelJS.CellValue> = {}) => {
  const cells: ExcelJS.CellValue[] = [
    'Math',
    'Example',
    'Fictional',
    43000,
    'K',
    '4A',
    null,
    'C',
    null,
    46000,
    null,
  ];
  for (const [column, value] of Object.entries(overrides)) cells[Number(column)] = value;
  return cells;
};
async function fixture(rows: ExcelJS.CellValue[][], setup?: (book: ExcelJS.Workbook) => void) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Roster');
  sheet.addRow(headings);
  rows.forEach((values) => sheet.addRow(values));
  setup?.(book);
  return Buffer.from(await book.xlsx.writeBuffer());
}
const issues = (report: Awaited<ReturnType<typeof previewRoster>>) =>
  Object.fromEntries(report.issues.map((issue) => [issue.code, issue.rows]));

test('roster preview groups subject rows by names and DOB without exposing records or changing bytes', async () => {
  const bytes = await fixture([row(), row({ 0: 'Reading', 5: 'AI' })]);
  const before = createHash('sha256').update(bytes).digest('hex');
  const report = await previewRoster(bytes, '2026-10-28');
  assert.equal(report.candidateStudentCount, 1);
  assert.equal(report.rowCount, 2);
  assert.deepEqual(report.subjectCounts, { Math: 1, Reading: 1 });
  assert.equal(report.productionImportReady, false);
  assert.deepEqual(issues(report)['missing-worksheet-position'], [2, 3]);
  assert.equal(report.sourceSha256, before);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), before);
  assert.doesNotMatch(JSON.stringify(report), /Example|Fictional|43000|46000/);
});

test('roster preview distinguishes namesakes and rejects repeated subject and conflicting grades', async () => {
  const report = await previewRoster(
    await fixture([row(), row({ 4: 1 }), row({ 3: 43001 })]),
    '2026-10-28',
  );
  assert.equal(report.candidateStudentCount, 2);
  assert.deepEqual(issues(report)['duplicate-student-subject'], [2, 3]);
  assert.deepEqual(issues(report)['conflicting-student-grade'], [2, 3]);
  assert.deepEqual(issues(report)['same-name-different-or-invalid-birth-date'], [2, 3, 4]);
});

test('roster preview preserves uncertainty around EFL, enrollment dates and worksheet meaning', async () => {
  const report = await previewRoster(
    await fixture([row(), row({ 0: 'EFL', 9: 46002, 10: '31/10' })]),
    '2026-10-28',
  );
  assert.deepEqual(report.subjectCounts, { Math: 1, Other: 1 });
  assert.deepEqual(issues(report)['unmapped-subject'], [3]);
  assert.deepEqual(issues(report)['subject-enrollment-dates-differ'], [2, 3]);
  assert.deepEqual(issues(report)['worksheet-semantics-unconfirmed'], [3]);
  assert.deepEqual(issues(report)['status-mapping-required'], [2, 3]);
  assert.ok(report.missingLaunchFields.includes('per-subject-paper-or-connect'));
});

test('roster preview never evaluates formulas or accepts cached formula results as student data', async () => {
  const report = await previewRoster(
    await fixture([
      row({ 2: { formula: '"private cached name"', result: 'private cached name' } }),
      row({ 2: { text: 'private link', hyperlink: 'https://example.invalid' } }),
    ]),
    '2026-10-28',
  );
  assert.equal(report.candidateStudentCount, 0);
  assert.deepEqual(issues(report)['unsupported-cell-value-or-formula'], [2, 3]);
  assert.doesNotMatch(JSON.stringify(report), /private|example.invalid/);
});

test('roster preview validates dates, rejects the fictitious Excel leap day and never merges missing DOB', async () => {
  const report = await previewRoster(
    await fixture([
      row({ 3: 60 }),
      row({ 3: null }),
      row({ 9: 50000 }),
      row({ 3: 50001 }),
      row({ 9: 42000 }),
    ]),
    '2026-10-28',
  );
  assert.deepEqual(issues(report)['invalid-or-future-birth-date'], [2, 3, 5]);
  assert.deepEqual(issues(report)['future-enrollment-date'], [4]);
  assert.deepEqual(issues(report)['enrollment-before-birth'], [5, 6]);
  assert.equal(report.candidateStudentCount, 4);
});

test('roster preview handles 1904 dates and formatted UTC dates consistently', async () => {
  const birth = new Date('2017-09-22T00:00:00.000Z');
  const enroll = new Date('2026-01-01T00:00:00.000Z');
  const report = await previewRoster(
    await fixture(
      [row({ 3: 41538, 9: 44561 }), row({ 0: 'Reading', 3: birth, 9: enroll })],
      (book) => {
        book.properties.date1904 = true;
      },
    ),
    '2026-10-28',
  );
  assert.equal(report.candidateStudentCount, 1);
  assert.equal(issues(report)['subject-enrollment-dates-differ'], undefined);
});

test('roster preview requires an explicit mapping and sheet selection, and rejects malformed files and review dates', async () => {
  const bytes = await fixture([row()], (book) => {
    book.addWorksheet('Other');
  });
  await assert.rejects(previewRoster(bytes, '2026-10-28'), /explicit sheet/);
  assert.equal((await previewRoster(bytes, '2026-10-28', 'Roster')).rowCount, 1);
  await assert.rejects(previewRoster(bytes, '2026-02-30', 'Roster'), /valid review date/);
  await assert.rejects(previewRoster(Buffer.from('invalid'), '2026-10-28'), /Cannot read/);
  await assert.rejects(
    previewRoster(
      await fixture([row()], (book) => {
        book.worksheets[0].getCell('A1').value = 'Unknown';
      }),
      '2026-10-28',
    ),
    /headings differ/,
  );
  await assert.rejects(previewRoster(await fixture([]), '2026-10-28'), /no data rows/);
});

test('roster preview enforces input bounds and flags overlong names and dates beyond the calendar range', async () => {
  await assert.rejects(
    previewRoster(Buffer.alloc(5 * 1024 * 1024 + 1), '2026-10-28'),
    /at most 5 MiB/,
  );
  await assert.rejects(
    previewRoster(
      await fixture([row()], (book) => {
        book.worksheets[0].getCell('A10002').value = 'Math';
      }),
      '2026-10-28',
    ),
    /10,000 data rows/,
  );
  const report = await previewRoster(
    await fixture([row({ 2: 'x'.repeat(121), 3: 2958465 })], (book) => {
      book.properties.date1904 = true;
    }),
    '2026-10-28',
  );
  assert.deepEqual(issues(report)['name-exceeds-profile-limit'], [2]);
  assert.deepEqual(issues(report)['invalid-or-future-birth-date'], [2]);
});

test('staged profiles consolidate known fields and leave setup explicitly pending without copying DOB or status codes', async () => {
  const staged = await stageRoster(
    await fixture([
      row({ 6: '***', 7: 'EO', 8: 'F' }),
      row({ 0: 'Reading', 5: 'BII', 9: 46002 }),
      row({ 0: 'EFL', 5: '7A' }),
      row({ 0: 'EFL', 2: 'Another fictional child' }),
    ]),
    '2026-10-28',
  );
  assert.equal(staged.profiles.length, 2);
  const profile = staged.profiles[0];
  assert.deepEqual(profile.sourceRows, [2, 3, 4]);
  assert.equal(profile.enrollmentDate, null);
  assert.deepEqual(
    profile.subjects.map((subject) => subject.subject),
    ['Math', 'Reading'],
  );
  assert.deepEqual(
    profile.subjects.map((subject) => subject.level),
    ['4A', 'BII'],
  );
  assert.notEqual(profile.subjects[0].enrollmentDate, profile.subjects[1].enrollmentDate);
  assert.ok(
    profile.subjects.every(
      (subject) =>
        subject.modality === null &&
        subject.worksheetPosition === null &&
        subject.dailyWorksheets === null &&
        subject.setupState === 'pending',
    ),
  );
  assert.equal(profile.visitDays, null);
  assert.equal(staged.profiles[1].subjects.length, 0);
  assert.equal(staged.excludedSubjectRows.length, 2);
  assert.equal(new Set(staged.profiles.map((profile) => profile.intakeId)).size, 2);
  assert.equal(staged.productionImportReady, false);
  assert.doesNotMatch(
    JSON.stringify(staged.profiles),
    /dob|birth|ASHR|ST1|ST2|EO|\*\*\*|2017-09-22/,
  );
  assert.equal('students' in staged, false); // Never a provisionable Database backup.
});

test('staging fails closed for identity conflicts, invalid source values and subjects outside the reviewed policy', async () => {
  await assert.rejects(
    stageRoster(await fixture([row(), row()]), '2026-10-28'),
    /blocking row issues/,
  );
  await assert.rejects(
    stageRoster(await fixture([row({ 3: null })]), '2026-10-28'),
    /blocking row issues/,
  );
  await assert.rejects(
    stageRoster(await fixture([row({ 0: 'Unreviewed subject' })]), '2026-10-28'),
    /Unreviewed subject mapping/,
  );
});

test('staging CLI saves an isolated pending artifact once and preserves IDs, source bytes and existing records on retry', async () => {
  await mkdir(resolve('data'), { recursive: true });
  const directory = await mkdtemp(resolve('data/test-roster-stage-'));
  const source = join(directory, 'fictional.xlsx');
  const sourceBytes = await fixture([row()]);
  await writeFile(source, sourceBytes);
  await mkdir(join(directory, 'data'));
  const sentinel = join(directory, 'data/demo-v1.json');
  const sentinelBytes = '{"testSentinel":"must remain unchanged"}';
  await writeFile(sentinel, sentinelBytes);
  const command = [
    resolve('scripts/run-ts.cjs'),
    resolve('scripts/roster-stage.ts'),
    source,
    '2026-10-28',
  ];
  const first = spawnSync(process.execPath, command, {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
  assert.equal(first.status, 0, first.stderr);
  const result = JSON.parse(first.stdout);
  assert.equal(result.stagedProfiles, 1);
  assert.equal(result.activeProfilesCreated, 0);
  const saved = await readFile(result.destination);
  assert.doesNotMatch(first.stdout, /Fictional|Example/);
  const retry = spawnSync(process.execPath, command, {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
  assert.equal(retry.status, 1);
  assert.match(retry.stderr, /already staged/);
  assert.deepEqual(await readFile(result.destination), saved);
  assert.deepEqual(await readFile(source), sourceBytes);
  assert.equal(await readFile(sentinel, 'utf8'), sentinelBytes);
});
