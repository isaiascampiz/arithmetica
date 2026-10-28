import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { allocatedRanges, dailyWork, dailyWorksheets } from '../src/lib/worksheet-allocation';
import { paperProposal, synchronizePreparation, withSubjectSettings } from '../src/lib/v3-planning';
import { applyV3, v3CommandInput } from '../src/lib/v3-domain';
import { applyV2, v2CommandInput } from '../src/lib/v2-domain';
import { validateDatabase } from '../src/lib/repository';
const now = new Date('2026-10-19T23:00:00Z');
test('daily worksheet allocation uses ten-sheet physical boundaries without gaps or rounded-up work', () => {
  assert.deepEqual(
    allocatedRanges('D', 8, 18, 3, true).map((r) => [r.start, r.end]),
    [
      [8, 10],
      [11, 20],
      [21, 28],
    ],
  );
  assert.deepEqual(
    allocatedRanges('D', 8, 5, 3, false).map((r) => [r.start, r.end]),
    [
      [8, 10],
      [11, 12],
    ],
  );
  const db = quickViewDemo(now),
    id = db.students[0].id,
    cfg = db.operations!.students[id].subjects.Math;
  cfg.dailyWork = dailyWork(5);
  cfg.nextStart = 1;
  cfg.classworkSheets = 5;
  db.operations!.students[id].visitDays = [1, 4];
  const plan = paperProposal(db, id, 'Math', '2026-10-19', 'new-plan', true)!;
  assert.deepEqual(
    [plan.v3!.inCenter!.range, ...plan.ranges].map((r) => [r.start, r.end]),
    [
      [1, 5],
      [6, 10],
      [11, 15],
    ],
  );
  assert.equal(plan.targetSheets, 10);
  assert.equal(plan.v3!.advanceCursor.start, 16);
  assert.equal(
    plan.ranges.reduce((n, r) => n + r.end - r.start + 1, 0),
    plan.targetSheets,
  );
  cfg.level = 'UNKNOWN';
  const blocked = paperProposal(db, id, 'Math', '2026-10-19', 'blocked', true)!;
  assert.equal(blocked.v3!.inCenter, null);
  assert.deepEqual(blocked.ranges, []);
  assert.ok(blocked.blocked.length);
});
test('daily policy preserves legacy plans, issued/held material and explicit physical review', () => {
  const db = quickViewDemo(now),
    id = db.students[0].id,
    cfg = db.operations!.students[id].subjects.Math;
  const legacy = paperProposal(db, id, 'Math', '2026-10-19', 'legacy', true)!;
  assert.ok(legacy.ranges.every((r) => r.end - r.start + 1 === cfg.sheetsPerPacket));
  const issued = structuredClone(db.operations!.assignments.filter((a) => a.v3?.issuedAt));
  const prepared = db.operations!.assignments.find(
    (a) => a.studentId === id && a.subject === 'Math' && a.v3 && !a.v3.issuedAt,
  )!;
  const packets = structuredClone(prepared.v3),
    version = prepared.v3!.version;
  cfg.dailyWork = dailyWork(3);
  synchronizePreparation(db, '2026-10-19');
  assert.equal(prepared.stale, true);
  assert.equal(prepared.v3!.version, version);
  assert.deepEqual(prepared.v3!.inCenter, packets!.inCenter);
  assert.deepEqual(prepared.v3!.held, packets!.held);
  assert.deepEqual(
    db.operations!.assignments.filter((a) => a.v3?.issuedAt),
    issued,
  );
  validateDatabase(JSON.parse(JSON.stringify(db)));
  (cfg.dailyWork as { version: number }).version = 2;
  assert.throws(() => validateDatabase(db));
});
test('repeat position retains the daily quantity while an explicit quantity change updates it', () => {
  const db = quickViewDemo(now),
    id = db.students[0].id,
    cfg = db.operations!.students[id].subjects.Math;
  cfg.dailyWork = dailyWork(15);
  cfg.packetsPerDay = 2;
  cfg.sheetsPerPacket = 10;
  const reposition = withSubjectSettings(db, id, 'Math', { nextStart: 51 });
  assert.equal(dailyWorksheets(reposition.operations!.students[id].subjects.Math), 15);
  const change = withSubjectSettings(db, id, 'Math', { packetsPerDay: 3 });
  assert.equal(dailyWorksheets(change.operations!.students[id].subjects.Math), 30);
  assert.equal(dailyWorksheets(cfg), 15);
});

test('older profile clients preserve an omitted daily policy, while homework-off guards reject new allocation changes', () => {
  for (const kind of ['v2', 'v3'] as const) {
    const db = quickViewDemo(now),
      s = db.students[0],
      cfg = db.operations!.students[s.id];
    cfg.subjects.Math.dailyWork = dailyWork(15);
    const settings = structuredClone(cfg);
    delete settings.subjects.Math.dailyWork;
    const payload = {
      action: 'student-save',
      studentId: s.id,
      name: s.name,
      earlyLearner: s.earlyLearner,
      settings,
      enrollmentDate: cfg.enrollmentDate,
      visitDays: [1, 4],
      tiles: [],
      goals: '',
    };
    if (kind === 'v3')
      applyV3(
        db,
        v3CommandInput.parse(payload),
        { name: 'Fictional teacher', role: 'instructor' },
        now,
      );
    else
      applyV2(
        db,
        v2CommandInput.parse(payload),
        { name: 'Fictional teacher', role: 'instructor' },
        now,
      );
    assert.equal(dailyWorksheets(db.operations!.students[s.id].subjects.Math), 15);
    db.operations!.v3!.features = { version: 1, homework: false, medals: true };
    const changed = structuredClone(db.operations!.students[s.id]);
    changed.subjects.Math.dailyWork = dailyWork(20);
    const command = { ...payload, settings: changed };
    assert.throws(
      () =>
        kind === 'v3'
          ? applyV3(
              db,
              v3CommandInput.parse(command),
              { name: 'Fictional teacher', role: 'instructor' },
              now,
            )
          : applyV2(
              db,
              v2CommandInput.parse(command),
              { name: 'Fictional teacher', role: 'instructor' },
              now,
            ),
      /turned off/,
    );
  }
});

test('explicit CONNECT fallback remains one exact packet and preserves its daily policy', () => {
  const db = quickViewDemo(now),
    student = db.students[1],
    cfg = db.operations!.students[student.id].subjects.Reading;
  cfg.dailyWork = dailyWork(15);
  const saved = structuredClone(cfg),
    visit = db.visits.findLast((v) => v.studentId === student.id && !v.departedAt)!;
  applyV3(
    db,
    v3CommandInput.parse({
      action: 'temporary-paper',
      visitId: visit.id,
      subject: 'Reading',
      range: { level: '4A', start: 1, end: 5 },
      reason: 'Explicit fictional fallback',
    }),
    { name: 'Fictional teacher', role: 'instructor' },
    now,
  );
  const set = db.operations!.assignments.findLast(
    (a) => a.studentId === student.id && a.v3?.temporaryPaper,
  )!;
  assert.deepEqual(
    set.v3!.planned.map((p) => p.range),
    [{ level: '4A', start: 1, end: 5 }],
  );
  assert.equal(set.v3!.advanceCursor.start, 6);
  assert.deepEqual(db.operations!.students[student.id].subjects.Reading, saved);
});
