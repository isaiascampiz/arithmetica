import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/lib/seed';
import { migrateV2 } from '../src/lib/migrate';
import { applyV2, type V2Command, v2CommandInput } from '../src/lib/v2-domain';
import { dayKey, isOpenVisit } from '../src/lib/model';
import {
  expectedOn,
  nextExpected,
  lastVisitBeforeVacation,
  zonedTimestamp,
  expectedMinutes,
} from '../src/lib/schedule';
import { planHomework, numbers, activeCorrections } from '../src/lib/homework';
import {
  archiveReport,
  buildReport,
  completionChart,
  runDueJobs,
  staffingWarnings,
} from '../src/lib/reports';
import { kioskScan } from '../src/lib/kiosk-attendance';
const now = new Date('2026-10-12T22:00:00Z'),
  staff = { name: 'Fictional Instructor', role: 'instructor' as const };

test('achievement medals accept all four tiers without evidence and preserve existing records and attribution', () => {
  const db = fixture(),
    studentId = db.students[0].id;
  const previous = structuredClone(db.operations!.achievements);
  for (const distinction of ['Bronze', 'Silver', 'Gold', 'Platinum'] as const) {
    const command = v2CommandInput.parse({
      action: 'achievement',
      studentId,
      subject: 'Reading',
      distinction,
      date: '2026-10-01',
    });
    applyV2(db, command, staff, now);
    assert.equal(db.operations!.achievements.at(-1)!.evidence, '');
    assert.equal(db.operations!.achievements.at(-1)!.verifiedBy, staff.name);
    assert.equal(db.operations!.achievements.at(-1)!.distinction, distinction);
    assert.equal(db.operations!.achievements.at(-1)!.subject, 'Reading');
  }
  assert.deepEqual(db.operations!.achievements.slice(0, previous.length), previous);
  const command = v2CommandInput.parse({
    action: 'achievement',
    studentId,
    subject: 'Math',
    distinction: 'Gold',
    date: '2026-10-01',
    evidence: 'Original source',
  });
  assert.throws(
    () => applyV2(db, command, { name: 'Fictional Assistant', role: 'assistant' }, now),
    /instructor/,
  );
  applyV2(db, command, staff, now);
  assert.equal(db.operations!.achievements.at(-1)!.evidence, 'Original source');
});
test('CONNECT completion counts worksheets and official totals without inventing physical paper sheets', () => {
  const db = fixture(),
    id = db.students[0].id;
  db.operations!.students[id].subjects.Math.format = 'CONNECT';
  const a = assignment(db);
  for (const status of ['approved', 'ready', 'distributed'] as const)
    run(db, {
      action: 'assignment-status',
      id: a.id,
      status,
      reason: 'Approved CONNECT record',
      correcting: false,
    });
  run(db, {
    action: 'completion',
    id: a.id,
    worksheets: a.ranges.flatMap(numbers),
    officialCount: 40,
    partial: false,
    reason: 'Manually verified CONNECT worksheet completion',
  });
  assert.equal(db.operations!.completions[0].physicalSheets, 0);
  const report = buildReport(db, 'monthly', '2026-10-12');
  assert.equal(report.physicalSheets, 0);
  assert.equal(report.officialSheets, 40);
  assert.equal(completionChart(db, id, '2026-10-01')[0].Math, 40);
});
test('center duration defaults apply while student overrides remain independent', () => {
  const db = fixture(),
    id = db.students[0].id,
    cfg = db.operations!.students[id];
  db.operations!.center.expectedMinutes = 50;
  assert.equal(expectedMinutes(db.operations!, cfg), 50);
  run(db, {
    action: 'student-save',
    studentId: id,
    name: db.students[0].name,
    earlyLearner: true,
    settings: { ...cfg, expectedMinutes: 60 },
  });
  assert.equal(expectedMinutes(db.operations!, db.operations!.students[id]), 60);
  db.operations!.center.expectedMinutes = 55;
  assert.equal(expectedMinutes(db.operations!, db.operations!.students[id]), 60);
});
test('late verified classwork is reported by the explicitly recorded completion date, not the data-entry month', () => {
  const db = fixture(),
    id = db.students[0].id;
  run(db, {
    action: 'classwork',
    studentId: id,
    subject: 'Math',
    range: { level: '4A', start: 91, end: 95 },
    completed: [91, 92, 93, 94, 95],
    officialCount: 5,
    workedDate: '2026-09-30',
  });
  assert.equal(buildReport(db, 'monthly', '2026-09-01').officialSheets, 5);
  assert.equal(buildReport(db, 'monthly', '2026-10-12').officialSheets, 0);
  assert.equal(db.operations!.completions[0].at, now.toISOString());
});
test('a manual midday report never suppresses the automatic closing snapshot', () => {
  const db = fixture();
  const before = archiveReport(db, 'daily', '2026-10-12', now, 'Manual midday snapshot');
  runDueJobs(db, new Date('2026-10-13T02:16:00Z'));
  const daily = db.operations!.reports.filter(
    (r) => r.kind === 'daily' && r.period === '2026-10-12',
  );
  assert.equal(daily.length, 2);
  assert.equal(daily[0].id, before.id);
  assert.equal(daily[1].version, 2);
  assert.equal(daily[1].jobKey, 'daily:2026-10-12');
  const total = daily.length;
  runDueJobs(db, new Date('2026-10-13T02:17:00Z'));
  assert.equal(db.operations!.reports.filter((r) => r.kind === 'daily').length, total);
});
test('homework proposals skip physical classwork ranges already recorded, preserving exact identities', () => {
  const db = fixture(),
    id = db.students[0].id;
  run(db, {
    action: 'classwork',
    studentId: id,
    subject: 'Math',
    range: { level: '4A', start: 101, end: 110 },
    completed: [101, 102],
  });
  const a = assignment(db);
  assert.equal(a.ranges[0].start, 111);
  assert.equal(a.targetSheets, 40);
  assert.ok(a.events[0].snapshot);
});
test('classwork updates replace verified ledger totals while retaining prior completion events', () => {
  const db = fixture(),
    id = db.students[0].id;
  const w = run(db, {
    action: 'classwork',
    studentId: id,
    subject: 'Math',
    range: { level: '4A', start: 91, end: 100 },
    completed: [91, 92],
  });
  run(db, {
    action: 'classwork-update',
    id: w,
    completed: [91, 92, 93, 94, 95],
    officialCount: 5,
    reason: 'Instructor confirmed the next three sheets',
  });
  assert.equal(db.operations!.classwork[0].completed.length, 5);
  assert.equal(db.operations!.classwork[0].events!.length, 2);
  assert.equal(db.operations!.completions.length, 2);
  assert.equal(buildReport(db, 'monthly', '2026-10-12').physicalSheets, 5);
  assert.throws(
    () =>
      run(db, {
        action: 'classwork',
        studentId: id,
        subject: 'Math',
        range: { level: '4A', start: 91, end: 100 },
        completed: [91, 92],
      }),
    /already has a record/,
  );
});
test('carryover cannot be reserved twice in different outgoing preparation cycles', () => {
  const db = fixture(),
    id = db.students[0].id;
  const w = run(db, {
    action: 'classwork',
    studentId: id,
    subject: 'Math',
    range: { level: '4A', start: 91, end: 100 },
    completed: [],
  });
  assignment(db, '2026-10-12', [w]);
  assert.throws(() => assignment(db, '2026-10-15', [w]), /reserved/);
});
function fixture() {
  const db = seed(now);
  migrateV2(db, now);
  const c = db.operations!.students[db.students[0].id];
  c.recurringDays = [1, 4];
  c.subjects.Math.nextStart = 101;
  c.subjects.Reading.nextStart = 201;
  c.subjects.Reading.sheetsPerPacket = 5;
  return db;
}
function run(db: ReturnType<typeof fixture>, c: V2Command, time = now) {
  return applyV2(db, v2CommandInput.parse(c), staff, time);
}
function assignment(db: ReturnType<typeof fixture>, date = '2026-10-12', carry: string[] = []) {
  const id = run(db, {
    action: 'plan',
    studentId: db.students[0].id,
    subject: 'Math',
    fromDate: date,
    carryIds: carry,
  });
  return db.operations!.assignments.find((a) => a.id === id)!;
}
function distribute(db: ReturnType<typeof fixture>, id: string) {
  for (const status of ['approved', 'ready', 'pulled', 'distributed'] as const)
    run(db, {
      action: 'assignment-status',
      id,
      status,
      reason: 'Instructor reviewed worksheet identities',
      correcting: false,
    });
}
test('V1 migration preserves every student, code, visit, note, packet and stable ID', () => {
  const db = seed(now),
    before = structuredClone(db);
  assert.equal(migrateV2(db, now), true);
  assert.equal(db.students.length, 96);
  for (const field of ['students', 'visits', 'observations', 'homework'] as const)
    assert.deepEqual(db[field], before[field]);
  assert.equal(migrateV2(db, now), false);
  assert.equal(db.schemaVersion, 2);
});
test('add/edit/withdraw/reactivate preserves identity/history; old QR revoked on reissue', () => {
  const db = fixture();
  const id = run(db, {
    action: 'student-add',
    name: 'Fictional Sky Rowan',
    earlyLearner: true,
  });
  const s = db.students.find((s) => s.id === id)!;
  const token = s.token;
  run(db, {
    action: 'student-save',
    studentId: id,
    name: 'Fictional Sky Ellis',
    earlyLearner: false,
    settings: { ...db.operations!.students[id], expectedMinutes: 60 },
  });
  run(db, { action: 'student-active', studentId: id, active: false });
  assert.equal(db.operations!.students[id].active, false);
  run(db, { action: 'student-active', studentId: id, active: true });
  run(db, {
    action: 'qr-reissue',
    studentId: id,
    reason: 'Replace fictional lost pouch',
  });
  assert.notEqual(s.token, token);
  assert.throws(() => kioskScan(db, token, now), /not recognized/);
  assert.equal(s.id, id);
});
test('stale student profile versions are rejected after a competing edit', () => {
  const db = fixture(),
    s = db.students[0],
    old = structuredClone(db.operations!.students[s.id]);
  run(db, {
    action: 'student-save',
    studentId: s.id,
    name: s.name,
    earlyLearner: true,
    settings: old,
  });
  assert.throws(
    () =>
      run(db, {
        action: 'student-save',
        studentId: s.id,
        name: 'Other fictional name',
        earlyLearner: false,
        settings: old,
      }),
    /another device/,
  );
});
test('withdrawal with an open visit requires attendance reconciliation', () => {
  const db = fixture();
  assert.throws(
    () =>
      run(db, {
        action: 'student-active',
        studentId: db.students[0].id,
        active: false,
      }),
    /open attendance/,
  );
});
test('Monday → Thursday means four Math packets; Thursday → Monday means six', () => {
  const db = fixture();
  assert.equal(planHomework(db, db.students[0].id, 'Math', '2026-10-12', [], now).targetPackets, 4);
  assert.equal(planHomework(db, db.students[0].id, 'Math', '2026-10-15', [], now).targetPackets, 6);
});
test('Reading independently uses different quantities and student homework exclusions', () => {
  const db = fixture(),
    id = db.students[0].id;
  assert.equal(planHomework(db, id, 'Reading', '2026-10-12', [], now).targetSheets, 10);
  db.operations!.students[id].subjects.Math.excludeDays = [0];
  assert.equal(planHomework(db, id, 'Math', '2026-10-15', [], now).targetSheets, 40);
});
test('family recurring schedules and individual overrides remain separate', () => {
  const db = fixture(),
    id = db.students[0].id;
  const family = run(db, {
    action: 'family-save',
    name: 'Fictional Bennett Family',
    recurringDays: [2, 3],
  });
  db.operations!.students[id].familyId = family;
  db.operations!.students[id].individualSchedule = false;
  assert.equal(expectedOn(db.operations!, id, '2026-10-13'), true);
  assert.equal(expectedOn(db.operations!, id, '2026-10-12'), false);
  db.operations!.students[id].individualSchedule = true;
  assert.equal(expectedOn(db.operations!, id, '2026-10-12'), true);
});
test('individual absences override family make-ups; individual make-ups override family vacation', () => {
  const db = fixture(),
    id = db.students[0].id;
  const family = run(db, {
    action: 'family-save',
    name: 'Fictional Override Family',
    recurringDays: [1, 4],
  });
  db.operations!.students[id].familyId = family;
  run(db, {
    action: 'schedule-add',
    studentId: null,
    familyId: family,
    kind: 'extra-visit',
    start: '2026-10-13',
    end: '2026-10-13',
    returnDate: null,
    reason: 'Family makeup',
  });
  run(db, {
    action: 'schedule-add',
    studentId: id,
    familyId: null,
    kind: 'absence',
    start: '2026-10-13',
    end: '2026-10-13',
    returnDate: null,
    reason: 'Individual absence',
  });
  assert.equal(expectedOn(db.operations!, id, '2026-10-13'), false);
  run(db, {
    action: 'schedule-add',
    studentId: null,
    familyId: family,
    kind: 'vacation',
    start: '2026-10-19',
    end: '2026-10-23',
    returnDate: null,
    reason: 'Family vacation',
  });
  run(db, {
    action: 'schedule-add',
    studentId: id,
    familyId: null,
    kind: 'extra-visit',
    start: '2026-10-20',
    end: '2026-10-20',
    returnDate: null,
    reason: 'Individual stays and attends',
  });
  assert.equal(expectedOn(db.operations!, id, '2026-10-20'), true);
});
test('temporary return changes recalculate proposals without overwriting recurring days', () => {
  const db = fixture(),
    id = db.students[0].id;
  db.operations!.students[id].recurringDays = [1, 3];
  const a = assignment(db);
  assert.equal(a.targetSheets, 20);
  run(db, {
    action: 'schedule-add',
    studentId: id,
    familyId: null,
    kind: 'move-visit',
    start: '2026-10-14',
    end: '2026-10-14',
    returnDate: '2026-10-15',
    reason: 'Fictional return changed to Thursday',
  });
  assert.equal(a.nextVisit, '2026-10-15');
  assert.equal(a.targetSheets, 40);
  assert.deepEqual(db.operations!.students[id].recurringDays, [1, 3]);
});
test('make-up visits, center closures and absence cancellation recalculate attendance', () => {
  const db = fixture(),
    id = db.students[0].id;
  const e = run(db, {
    action: 'schedule-add',
    studentId: id,
    familyId: null,
    kind: 'absence',
    start: '2026-10-15',
    end: '2026-10-15',
    returnDate: null,
    reason: 'Fictional appointment',
  });
  assert.equal(nextExpected(db.operations!, id, '2026-10-12'), '2026-10-19');
  run(db, {
    action: 'schedule-add',
    studentId: id,
    familyId: null,
    kind: 'extra-visit',
    start: '2026-10-14',
    end: '2026-10-14',
    returnDate: null,
    reason: 'Fictional makeup visit',
  });
  assert.equal(nextExpected(db.operations!, id, '2026-10-12'), '2026-10-14');
  db.operations!.center.closedDates.push('2026-10-14');
  assert.equal(expectedOn(db.operations!, id, '2026-10-14'), false);
  run(db, {
    action: 'schedule-cancel',
    id: e,
    reason: 'Family cancelled the exception',
  });
  assert.equal(expectedOn(db.operations!, id, '2026-10-15'), true);
});
test('advance vacation flags last visit and creates capped proposals for both subjects', () => {
  const db = fixture(),
    id = db.students[0].id;
  run(db, {
    action: 'schedule-add',
    studentId: id,
    familyId: null,
    kind: 'vacation',
    start: '2026-10-26',
    end: '2026-11-20',
    returnDate: null,
    reason: 'Fictional advance vacation',
  });
  assert.equal(lastVisitBeforeVacation(db.operations!, id, '2026-10-12'), '2026-10-22');
  const a = db.operations!.assignments.find(
    (a) => a.studentId === id && a.subject === 'Math' && a.fromDate === '2026-10-22',
  )!;
  assert.ok(a.capped);
  assert.equal(a.targetSheets, 200);
  assert.throws(
    () =>
      run(db, {
        action: 'assignment-status',
        id: a.id,
        status: 'approved',
        reason: '',
        correcting: false,
      }),
    /capped/,
  );
});
test('duplicate homework proposals do not create duplicate preparation tasks', () => {
  const db = fixture();
  assignment(db);
  assignment(db);
  assert.equal(db.operations!.assignments.length, 1);
});
test('CONNECT assignments never produce ordinary paper pull tasks', () => {
  const db = fixture(),
    id = db.students[0].id;
  db.operations!.students[id].subjects.Math.format = 'CONNECT';
  const a = assignment(db);
  run(db, {
    action: 'assignment-status',
    id: a.id,
    status: 'approved',
    reason: 'Approved CONNECT plan',
    correcting: false,
  });
  run(db, {
    action: 'assignment-status',
    id: a.id,
    status: 'ready',
    reason: 'Ready in CONNECT',
    correcting: false,
  });
  assert.throws(
    () =>
      run(db, {
        action: 'assignment-status',
        id: a.id,
        status: 'pulled',
        reason: '',
        correcting: false,
      }),
    /no paper/,
  );
  run(db, {
    action: 'assignment-status',
    id: a.id,
    status: 'distributed',
    reason: 'Recorded CONNECT assignment',
    correcting: false,
  });
  assert.equal(a.status, 'distributed');
});
test('corrections precede new classwork, keep age/visits, and allow partial or explained deferral', () => {
  const db = fixture(),
    id = db.students[0].id;
  const correction = run(db, {
    action: 'correction-add',
    studentId: id,
    subject: 'Math',
    range: { level: '4A', start: 91, end: 100 },
    reason: 'Fictional grading correction',
  });
  assert.throws(
    () =>
      run(db, {
        action: 'classwork',
        studentId: id,
        subject: 'Math',
        range: { level: '4A', start: 101, end: 110 },
        completed: [],
      }),
    /outstanding corrections/,
  );
  run(db, {
    action: 'correction-update',
    id: correction,
    remaining: [96, 97, 98, 99, 100],
    state: 'partial',
    reason: 'First five corrections verified',
  });
  assert.equal(activeCorrections(db, id)[0].remaining.length, 5);
  run(db, {
    action: 'correction-update',
    id: correction,
    remaining: [96, 97, 98, 99, 100],
    state: 'deferred',
    reason: 'Instructor will revisit next visit',
  });
  run(db, {
    action: 'classwork',
    studentId: id,
    subject: 'Math',
    range: { level: '4A', start: 101, end: 110 },
    completed: [],
  });
  assert.equal(db.operations!.classwork.length, 1);
});
test('one unfinished ten-sheet packet replaces one of six planned packets', () => {
  const db = fixture(),
    id = db.students[0].id;
  const work = run(db, {
    action: 'classwork',
    studentId: id,
    subject: 'Math',
    range: { level: '4A', start: 91, end: 100 },
    completed: [],
  });
  const a = assignment(db, '2026-10-15', [work]);
  assert.equal(a.targetSheets, 60);
  assert.equal(a.newSheets, 50);
  assert.equal(a.newPackets, 5);
  assert.equal(a.carryRanges.flatMap(numbers).length, 10);
  assert.equal(a.newSheets + a.carryRanges.flatMap(numbers).length, 60);
});
test('partial classwork preserves exact unfinished identities without duplicate new sheets', () => {
  const db = fixture(),
    id = db.students[0].id;
  const work = run(db, {
    action: 'classwork',
    studentId: id,
    subject: 'Math',
    range: { level: '4A', start: 101, end: 110 },
    completed: [101, 102, 103, 104, 105],
  });
  const a = assignment(db, '2026-10-15', [work]);
  assert.deepEqual(a.carryRanges, [{ level: '4A', start: 106, end: 110 }]);
  assert.equal(a.newSheets, 55);
  assert.ok(a.ranges.flatMap(numbers).every((n) => n < 106 || n > 110));
});
test('partial return, official counts and duplicate completion validation reconcile monthly totals', () => {
  const db = fixture();
  const a = assignment(db);
  distribute(db, a.id);
  run(db, {
    action: 'completion',
    id: a.id,
    worksheets: Array.from({ length: 20 }, (_, i) => 101 + i),
    officialCount: 20,
    partial: true,
    reason: 'First twenty physical sheets verified',
  });
  assert.equal(a.status, 'partial');
  assert.throws(
    () =>
      run(db, {
        action: 'completion',
        id: a.id,
        worksheets: [101],
        officialCount: 1,
        partial: true,
        reason: 'Duplicate test',
      }),
    /already verified/,
  );
  run(db, {
    action: 'completion',
    id: a.id,
    worksheets: Array.from({ length: 20 }, (_, i) => 121 + i),
    officialCount: null,
    partial: false,
    reason: 'Remaining sheets verified; official count not established',
  });
  const report = buildReport(db, 'monthly', '2026-10-12');
  assert.equal(report.physicalSheets, 40);
  assert.equal(report.officialSheets, 20);
  assert.equal(report.unreportableCompletions, 1);
});
test('audited status corrections revoke ledger entries without deleting events or completions', () => {
  const db = fixture();
  const a = assignment(db);
  distribute(db, a.id);
  run(db, {
    action: 'completion',
    id: a.id,
    worksheets: a.ranges.flatMap(numbers),
    officialCount: 40,
    partial: false,
    reason: 'Verified return test',
  });
  const originalEvents = a.events.length;
  run(db, {
    action: 'assignment-status',
    id: a.id,
    status: 'returned',
    reason: 'Instructor corrected an inaccurate verification',
    correcting: true,
  });
  assert.equal(db.operations!.completions.length, 1);
  assert.equal(db.operations!.completions[0].active, false);
  assert.equal(a.events.length, originalEvents + 1);
  assert.equal(buildReport(db, 'monthly', '2026-10-12').officialSheets, 0);
});
test('freeform notes never apply instruction; approved decisions preserve level history', () => {
  const db = fixture(),
    id = db.students[0].id;
  const d = run(db, {
    action: 'decision',
    studentId: id,
    subject: 'Math',
    kind: 'advance',
    range: { level: '3A', start: 1, end: 10 },
    note: 'Verified instructor advancement decision',
  });
  assert.equal(db.operations!.students[id].subjects.Math.level, '4A');
  run(db, { action: 'decision-approve', id: d });
  assert.equal(db.operations!.students[id].subjects.Math.level, '3A');
  assert.equal(db.operations!.configHistory.at(-1)!.subjects.Math.level, '3A');
  assert.equal(db.operations!.decisions[0].approvedBy, staff.name);
});
test('concrete approved decisions supersede pending reviews rather than permanently blocking work', () => {
  const db = fixture(),
    id = db.students[0].id;
  run(db, {
    action: 'decision',
    studentId: id,
    subject: 'Math',
    kind: 'review',
    range: { level: '4A', start: 101, end: 110 },
    note: 'Review before choosing range',
  });
  const d = run(db, {
    action: 'decision',
    studentId: id,
    subject: 'Math',
    kind: 'repeat-range',
    range: { level: '4A', start: 101, end: 110 },
    note: 'Repeat this exact range only',
  });
  run(db, { action: 'decision-approve', id: d });
  const a = assignment(db);
  assert.equal(a.blocked.length, 0);
  assert.equal(a.targetSheets, 10);
  assert.deepEqual(a.ranges, [{ level: '4A', start: 101, end: 110 }]);
});
test('not-assessed ratings and missing chart data are never treated as poor performance', () => {
  const db = fixture();
  assert.deepEqual(completionChart(db, db.students[0].id, '2026-01-01'), []);
  const ratings = Object.fromEntries(
    ['Focus', 'Independence', 'Accuracy', 'Pace', 'Understanding', 'Progress', 'Corrections'].map(
      (d) => [d, 'Not assessed'],
    ),
  ) as Extract<V2Command, { action: 'evaluation' }>['ratings'];
  run(db, {
    action: 'evaluation',
    studentId: db.students[0].id,
    subject: 'Math',
    ratings,
    text: 'Fictional optional note',
    followUp: true,
  });
  assert.equal(db.operations!.evaluations[0].ratings.Focus, 'Not assessed');
  assert.ok(db.observations.at(-1)!.followUp);
  assert.equal(db.observations.at(-1)!.reviewedAt, null);
});
test('rapid kiosk scans are ignored; later scan checks out; another visit can open that day', () => {
  const db = fixture(),
    s = db.students[50],
    token = s.token;
  const first = kioskScan(db, token, now);
  assert.equal(first.direction, 'in');
  assert.equal(kioskScan(db, token, new Date(now.getTime() + 1000)).changed, false);
  assert.equal(kioskScan(db, token, new Date(now.getTime() + 60000)).direction, 'out');
  assert.equal(kioskScan(db, token, new Date(now.getTime() + 120000)).direction, 'in');
  assert.equal(db.visits.filter((v) => v.studentId === s.id).length, 2);
});
test('stale open visits and unverified auto-closures require staff review at the kiosk', () => {
  const db = fixture(),
    s = db.students[0];
  assert.throws(() => kioskScan(db, s.token, new Date('2026-10-13T22:00:00Z')), /previous visit/);
  runDueJobs(db, new Date('2026-10-13T02:16:00Z'));
  const v = db.visits.find((v) => v.studentId === s.id)!;
  assert.equal(v.departedAt, null);
  assert.equal(v.departureVerified, false);
  assert.ok(v.closedAt);
  assert.throws(() => kioskScan(db, s.token, new Date('2026-10-13T22:00:00Z')), /staff review/);
});
test('staff reconciles unverified departure and undoes an accidental checkout without deleting events', () => {
  const db = fixture(),
    s = db.students[0];
  runDueJobs(db, new Date('2026-10-13T02:16:00Z'));
  const v = db.visits.find((v) => v.studentId === s.id)!;
  run(
    db,
    {
      action: 'visit-reconcile',
      id: v.id,
      mode: 'verify',
      departedAt: '2026-10-12T23:00:00Z',
      reason: 'Instructor verified pickup record',
    },
    new Date('2026-10-13T03:00:00Z'),
  );
  assert.equal(v.departureVerified, true);
  assert.equal(v.departedAt, '2026-10-12T23:00:00.000Z');
  assert.ok(v.events?.some((e) => e.kind === 'administrative-close'));
  run(
    db,
    {
      action: 'visit-reconcile',
      id: v.id,
      mode: 'reopen',
      reason: 'Undo inaccurate verified departure',
    },
    new Date('2026-10-13T03:00:00Z'),
  );
  assert.ok(isOpenVisit(v));
  assert.ok(v.events!.length >= 3);
});
test('daily/weekly/monthly jobs catch up and duplicate job calls do not duplicate snapshots', () => {
  const db = fixture(),
    time = new Date('2026-10-16T02:16:00Z');
  runDueJobs(db, time);
  assert.equal(db.operations!.reports.filter((r) => r.kind === 'daily').length, 4);
  assert.equal(db.operations!.reports.filter((r) => r.kind === 'weekly').length, 1);
  assert.equal(runDueJobs(db, time), 0);
  runDueJobs(db, new Date('2026-11-01T20:00:00Z'));
  assert.equal(
    db.operations!.reports.filter((r) => r.kind === 'monthly' && r.period === '2026-10').length,
    1,
  );
});
test('daily jobs before 7:15 PM do not archive today; prior snapshots remain immutable and revisions append', () => {
  const db = fixture();
  runDueJobs(db, new Date('2026-10-13T02:14:00Z'));
  assert.equal(db.operations!.reports.length, 0);
  const r = archiveReport(db, 'monthly', '2026-10-12', now);
  const old = JSON.stringify(r);
  db.operations!.students[db.students[0].id].subjects.Math.level = 'B';
  const same = archiveReport(db, 'monthly', '2026-10-12', now);
  assert.equal(same.id, r.id);
  const newer = archiveReport(db, 'monthly', '2026-10-12', now, 'Instructor correction', true);
  assert.equal(newer.version, 2);
  assert.equal(JSON.stringify(r), old);
});
test('overlapping orientations and early-learner demand flag staffing impact; graders do not replace instructors', () => {
  const db = fixture();
  const id = run(db, {
    action: 'appointment-save',
    title: 'Fictional Rowan orientation',
    staffId: 'staff-alex',
    startsAt: '2026-10-12T22:00:00Z',
    minutes: 60,
    notes: 'Fictional notes',
    status: 'scheduled',
  });
  const a = db.operations!.appointments.find((a) => a.id === id)!;
  assert.ok(staffingWarnings(db, a).some((w) => w.includes('early learners')));
  run(db, {
    action: 'appointment-save',
    title: 'Fictional overlap',
    staffId: 'staff-alex',
    startsAt: '2026-10-12T22:15:00Z',
    minutes: 30,
    notes: '',
    status: 'scheduled',
  });
  assert.ok(staffingWarnings(db, a).some((w) => w.includes('overlapping')));
});
test('center-local timestamps and date arithmetic handle DST without accepting nonexistent times', () => {
  assert.equal(dayKey(zonedTimestamp('2026-10-12', '19:15', 'America/Los_Angeles')), '2026-10-12');
  assert.equal(
    zonedTimestamp('2026-10-12', '19:15', 'America/Los_Angeles'),
    '2026-10-13T02:15:00.000Z',
  );
  assert.throws(
    () => zonedTimestamp('2026-03-08', '02:30', 'America/Los_Angeles'),
    /does not exist/,
  );
});
test('assistant cannot alter instructional decisions, achievements, student identity or verified completions', () => {
  const db = fixture();
  const assistant = { name: 'Fictional Assistant', role: 'assistant' as const };
  assert.throws(
    () =>
      applyV2(
        db,
        {
          action: 'student-add',
          name: 'Fictional Student',
          earlyLearner: false,
        },
        assistant,
        now,
      ),
    /instructor/,
  );
  assert.throws(
    () =>
      applyV2(
        db,
        {
          action: 'decision',
          studentId: db.students[0].id,
          subject: 'Math',
          kind: 'continue',
          range: { level: '4A', start: 1, end: 10 },
          note: 'Test decision',
        },
        assistant,
        now,
      ),
    /instructor/,
  );
});
