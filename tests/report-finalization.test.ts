import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { applyV3, v3CommandInput } from '../src/lib/v3-domain';
import { verificationPackets, verifiedPaperEntries } from '../src/lib/completion-evidence';
import { archiveReport, buildReport, reportBounds } from '../src/lib/reports';
import { reportWorkbook } from '../src/lib/report-workbook';
import { activityOverview, activityTimeline } from '../src/lib/activity-overview';
import { kioskSettings } from '../src/lib/kiosk-settings';
import { validateDatabase } from '../src/lib/repository';
import { applyV2 } from '../src/lib/v2-domain';
import { dayKey, type Staff } from '../src/lib/model';

const now = new Date('2026-10-19T23:35:00Z');
const teacher: Staff = { role: 'instructor', name: 'Fictional verifier' };
const owner: Staff = { role: 'owner', name: 'Fictional owner' };
function setup() {
  const db = quickViewDemo(now);
  const visit = db.visits.find((v) => v.sessionRecords?.some((r) => r.subject === 'Math'))!;
  const evidence = verificationPackets(db, visit.id, 'Math')[0];
  assert.ok(evidence);
  const command = {
    action: 'verify-sheets' as const,
    visitId: visit.id,
    subject: 'Math' as const,
    packetId: evidence.packet.id,
    expectedSourceVersion: evidence.source.v3!.version,
    expectedVerificationVersion: 0,
    worksheets: [evidence.packet.range.start],
    completedDate: dayKey(visit.arrivedAt, db.operations!.center.timezone),
    reason: 'Fictional physical verification',
  };
  return { db, visit, evidence, command };
}

test('explicit sheet verification is attributed, bounded, stale-safe and independent of physical attendance/planning', () => {
  const { db, command, evidence } = setup();
  assert.equal(verifiedPaperEntries(db).length, 0);
  const visits = structuredClone(db.visits),
    assignments = structuredClone(db.operations!.assignments);
  assert.throws(
    () => applyV3(db, command, { role: 'assistant', name: 'Fictional helper' }, now),
    /instructor/,
  );
  assert.throws(
    () => applyV3(db, { ...command, worksheets: [evidence.packet.range.end + 1] }, teacher, now),
    /within/,
  );
  assert.throws(
    () => applyV3(db, { ...command, completedDate: '2026-10-20' }, teacher, now),
    /future/,
  );
  assert.throws(
    () => applyV3(db, { ...command, expectedSourceVersion: -1 }, teacher, now),
    /changed/,
  );
  applyV3(db, v3CommandInput.parse(command), teacher, now);
  assert.equal(verifiedPaperEntries(db)[0].physicalSheets, 1);
  assert.equal(verifiedPaperEntries(db)[0].verifiedBy, teacher.name);
  assert.deepEqual(db.visits, visits);
  assert.deepEqual(db.operations!.assignments, assignments);
  assert.throws(() => applyV3(db, command, teacher, now), /changed/);
  assert.throws(
    () => applyV3(db, { ...command, expectedVerificationVersion: 1 }, teacher, now),
    /already/,
  );
});

test('verification corrections supersede evidence; identical worksheet numbers in a new physical packet count independently', () => {
  const { db, visit, command, evidence } = setup();
  const first = applyV3(db, command, teacher, now);
  applyV3(
    db,
    {
      ...command,
      expectedVerificationVersion: 1,
      supersedes: first,
      worksheets: [evidence.packet.range.start, evidence.packet.range.start + 1],
      reason: 'Fictional recount after checking two sheets',
    },
    teacher,
    now,
  );
  assert.equal(db.operations!.completions[0].active, false);
  assert.equal(
    verifiedPaperEntries(db).reduce((n, c) => n + c.physicalSheets, 0),
    2,
  );
  const repeated = structuredClone(evidence.packet);
  repeated.id += ':new-physical-repeat';
  visit
    .sessionRecords!.filter((r) => r.subject === 'Math')
    .at(-1)!
    .outgoing.push(repeated);
  applyV3(db, { ...command, packetId: repeated.id }, teacher, now);
  assert.equal(
    verifiedPaperEntries(db).reduce((n, c) => n + c.physicalSheets, 0),
    3,
  );
  assert.equal(db.operations!.completions.length, 3);
  const before = JSON.stringify(db.operations!.completions);
  assert.throws(
    () =>
      applyV3(db, { ...command, expectedVerificationVersion: 2, supersedes: first }, teacher, now),
    /no longer active/,
  );
  assert.equal(JSON.stringify(db.operations!.completions), before);
});

test('report totals exclude assumptions, CONNECT and contradictory evidence; archived detail is frozen', () => {
  const { db, command, visit } = setup();
  assert.equal(buildReport(db, 'monthly', '2026-10', now).physicalSheets, 0);
  applyV3(db, command, teacher, now);
  const valid = db.operations!.completions[0];
  db.operations!.completions.push({
    ...valid,
    id: 'fictional-connect',
    packetId: 'connect',
    format: 'CONNECT',
    physicalSheets: 0,
  });
  db.operations!.completions.push({
    ...valid,
    id: 'fictional-damaged',
    packetId: 'damaged',
    physicalSheets: 17,
  });
  db.observations.push({
    id: 'fictional-note',
    studentId: visit.studentId,
    visitId: visit.id,
    createdAt: visit.arrivedAt,
    author: teacher.name,
    text: '=Never a spreadsheet formula',
    choices: [],
    followUp: false,
    reviewedAt: null,
    reviewedBy: null,
  });
  const report = archiveReport(
    db,
    'monthly',
    '2026-10',
    now,
    'Fictional snapshot',
    true,
    'fictional-request',
  );
  assert.equal(report.payload.physicalSheets, 1);
  assert.equal(report.payload.detail!.completions.length, 1);
  assert.equal(report.payload.detail!.excludedCompletions, 1);
  assert.equal(
    report.payload.detail!.levels.reduce((n, l) => n + l.sheets, 0),
    1,
  );
  assert.equal(
    report.payload.studentSummaries.reduce((n, s) => n + s.physicalSheets, 0),
    1,
  );
  const frozen = JSON.stringify(report);
  db.observations.at(-1)!.text = 'Changed later';
  db.visits[0].departedAt = null;
  db.operations!.completions[0].active = false;
  assert.equal(JSON.stringify(report), frozen);
  assert.equal(
    archiveReport(db, 'monthly', '2026-10', now, 'Fictional snapshot', true, 'fictional-request')
      .id,
    report.id,
  );
  assert.throws(
    () =>
      archiveReport(db, 'monthly', '2026-10', now, 'Different reason', true, 'fictional-request'),
    /already used/,
  );
  assert.equal(archiveReport(db, 'monthly', '2026-10', now, 'Corrected snapshot', true).version, 2);
});

test('Excel round trip retains typed counts, four readable sheets, filters and safe text', async () => {
  const { db, command } = setup();
  db.students.find(
    (s) => s.id === db.visits.find((v) => v.id === command.visitId)!.studentId,
  )!.name = '=HYPERLINK("fictional")';
  applyV3(db, command, teacher, now);
  const report = archiveReport(db, 'monthly', '2026-10', now);
  const bytes = await reportWorkbook(report);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  assert.deepEqual(
    workbook.worksheets.map((s) => s.name),
    ['Summary', 'Students & subjects', 'Completion detail', 'Attendance'],
  );
  const completions = workbook.getWorksheet('Completion detail')!;
  assert.equal(completions.getCell('G2').value, 1);
  assert.equal(completions.getCell('C2').value, '=HYPERLINK("fictional")');
  assert.equal(completions.getCell('C2').type, ExcelJS.ValueType.String);
  assert.equal(completions.getCell('H2').type, ExcelJS.ValueType.Date);
  assert.ok(completions.autoFilter);
  assert.equal(completions.views[0].state, 'frozen');
  const summary = workbook.getWorksheet('Summary')!;
  let total: ExcelJS.CellValue;
  summary.eachRow((row) => {
    if (row.getCell(1).value === 'Verified completed paper sheets') total = row.getCell(2).value;
  });
  assert.equal(total!, 1);
});

test('live center counts deduplicate students and keep old unresolved visits separate; timeline retains subject events', () => {
  const { db } = setup();
  const today = db.visits.find((v) => !v.departedAt)!;
  db.visits.push({
    ...structuredClone(today),
    id: 'fictional-second-visit',
    departedAt: now.toISOString(),
  });
  const counts = activityOverview(db, now);
  assert.equal(counts.arrived, 3);
  assert.equal(counts.here, 3);
  const old = db.visits.find((v) => v.departedAt)!;
  old.departedAt = null;
  assert.equal(activityOverview(db, now).unresolved, 1);
  assert.equal(activityOverview(db, now).here, 3);
  const timeline = activityTimeline(db, now);
  assert.ok(timeline.some((e) => e.kind === 'Math instructor check-in'));
  assert.ok(timeline.every((e, i) => !i || timeline[i - 1].at <= e.at));
});

test('kiosk configuration defaults, role/version checks and malformed persistence fail closed', () => {
  const { db } = setup();
  assert.equal(kioskSettings(db).confirmationSeconds, 4);
  const command = { action: 'kiosk-settings' as const, expectedVersion: 0, confirmationSeconds: 7 };
  assert.throws(() => applyV3(db, command, teacher, now), /owner/);
  applyV3(db, command, owner, now);
  assert.equal(kioskSettings(db).confirmationSeconds, 7);
  assert.throws(() => applyV3(db, command, owner, now), /changed/);
  db.operations!.v3!.kiosk!.confirmationSeconds = 999;
  assert.throws(() => validateDatabase(db), /Invalid kiosk/);
  assert.deepEqual(reportBounds('monthly', '2028-02'), { start: '2028-02-01', end: '2028-02-29' });
});

test('duplicate physical completion evidence is excluded and center configuration rejects stale writes', () => {
  const { db, command } = setup();
  applyV3(db, command, teacher, now);
  db.operations!.completions.push({
    ...structuredClone(db.operations!.completions[0]),
    id: 'fictional-conflicting-verification',
  });
  const report = buildReport(db, 'monthly', '2026-10', now);
  assert.equal(report.physicalSheets, 0);
  assert.equal(report.detail!.excludedCompletions, 2);
  const center = db.operations!.center;
  const change = {
    action: 'center-save' as const,
    expectedVersion: 0,
    name: center.name,
    operatingDays: center.operatingDays,
    closedDates: center.closedDates,
    closingTime: center.closingTime,
    reportTime: center.reportTime,
    autoClose: center.autoClose,
    expectedMinutes: center.expectedMinutes,
    earlyPerInstructor: center.earlyPerInstructor,
  };
  applyV2(db, change, owner, now);
  assert.equal(center.version, 1);
  assert.throws(() => applyV2(db, change, owner, now), /changed/);
});
