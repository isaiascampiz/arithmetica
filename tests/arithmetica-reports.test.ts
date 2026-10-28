import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { buildReport, archiveReport } from '../src/lib/reports';
import { reportVisitGroups } from '../src/lib/report-view';
import { monthlyReportWorkbook } from '../src/lib/report-workbook';
import { punchHistory } from '../src/lib/punch-history';
import { dayKey } from '../src/lib/model';

const now = new Date('2026-10-19T23:35:00Z');
test('report observation groups partition visits without counting empty handoffs or duplicate notes', () => {
  const db = quickViewDemo(now),
    v = db.visits[0];
  db.observations = [];
  db.operations!.evaluations = [];
  const note = {
    id: 'note',
    visitId: v.id,
    studentId: v.studentId,
    createdAt: v.arrivedAt,
    author: 'Fictional instructor',
    text: 'Observed independently',
    choices: [],
    followUp: false,
    reviewedAt: null,
    reviewedBy: null,
  };
  db.observations.push(note, { ...note, id: 'second-note' });
  const detail = buildReport(db, 'monthly', '2026-10', now).detail!;
  const groups = reportVisitGroups(detail);
  assert.equal(groups.recorded.filter((r) => r.visit.id === v.id).length, 1);
  assert.equal(groups.recorded.length + groups.unrecorded.length, detail.visits.length);
  assert.ok(groups.unrecorded.length > 0);
});

test('monthly export is a single sheet, frozen, formula-safe and uses ten-sheet packet equivalents', async () => {
  const db = quickViewDemo(now),
    student = db.students[0],
    op = db.operations!;
  student.name = '=Fictional worksheet student';
  op.students[student.id].grade = 'Grade 4';
  op.configHistory.push({
    studentId: student.id,
    at: now.toISOString(),
    name: student.name,
    subjects: structuredClone(op.students[student.id].subjects),
    settings: structuredClone(op.students[student.id]),
  });
  op.completions.push({
    id: 'verified-month',
    studentId: student.id,
    subject: 'Math',
    level: 'A',
    worksheets: [1, 2, 3],
    physicalSheets: 3,
    format: 'Paper',
    completedDate: '2026-10-19',
    officialCount: null,
    verifiedBy: 'Fictional verifier',
    at: now.toISOString(),
    active: true,
    assignmentId: 'verified-source',
    packetId: 'verified-packet',
    reason: 'Test evidence',
  });
  op.completions.push({
    ...op.completions.at(-1)!,
    id: 'future',
    packetId: 'future-packet',
    level: 'B',
    completedDate: '2026-11-01',
    at: '2026-11-01T23:00:00Z',
  });
  const report = archiveReport(db, 'monthly', '2026-10', now, 'Fictional report', true);
  student.name = 'Changed later';
  op.students[student.id].grade = 'Grade 9';
  op.completions[0].physicalSheets = 99;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await monthlyReportWorkbook(report));
  assert.equal(book.worksheets.length, 1);
  const row = book.worksheets[0]
    .getRows(2, book.worksheets[0].rowCount - 1)!
    .find(
      (r) => r.getCell(1).value === '=Fictional worksheet student' && r.getCell(3).value === 'Math',
    )!;
  assert.equal(row.getCell(1).type, ExcelJS.ValueType.String);
  assert.equal(row.getCell(2).value, 'Grade 4');
  assert.equal(row.getCell(4).value, 'A');
  assert.equal(row.getCell(5).value, 3);
  assert.equal(row.getCell(6).value, 3);
  assert.equal(row.getCell(7).value, 0.3);
  await assert.rejects(() => monthlyReportWorkbook({ ...report, kind: 'daily' }), /monthly/);
});

test('punch history student search and period buckets reconcile while administrative closing is not a checkout', () => {
  const db = quickViewDemo(now),
    tz = db.operations!.center.timezone,
    student = db.students[0];
  const visit = db.visits.find((v) => v.studentId === student.id)!;
  visit.departedAt = null;
  visit.closedAt = now.toISOString();
  visit.departureVerified = false;
  const before = JSON.stringify(db);
  const result = punchHistory(db, '8 weeks', 0, student.name, now);
  assert.ok(result.rows.every((r) => r.studentId === student.id));
  assert.equal(
    result.bins.reduce((n, b) => n + b.actual, 0),
    result.rows.filter((r) => r.kind === 'Check-in').length,
  );
  assert.equal(
    result.bins.reduce((n, b) => n + b.expected, 0),
    result.rows.filter((r) => r.kind === 'Check-out').length,
  );
  assert.equal(
    result.rows.find((r) => r.visitId === visit.id && r.kind === 'Check-out'),
    undefined,
  );
  assert.equal(result.unit, 'week');
  assert.equal(punchHistory(db, '1 month', 0, '', now).unit, 'day');
  assert.equal(punchHistory(db, '1 year', 0, '', now).unit, 'month');
  assert.equal(result.end, dayKey(now, tz));
  assert.equal(JSON.stringify(db), before);
});
