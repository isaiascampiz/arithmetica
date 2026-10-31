import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { centerFeatures } from '../src/lib/center-features';
import { applyV3, v3CommandInput } from '../src/lib/v3-domain';
import { applyV2, v2CommandInput } from '../src/lib/v2-domain';
import { applyCommand, attendance } from '../src/lib/domain';
import { synchronizePreparation } from '../src/lib/v3-planning';
import { homeworkReviews } from '../src/lib/homework-consistency';
import { validateDatabase } from '../src/lib/repository';
import { isOpenVisit, type Database, type Staff } from '../src/lib/model';
const now = new Date('2026-10-12T21:00:00Z');
const owner: Staff = { name: 'Fictional Owner', role: 'owner' },
  teacher: Staff = { name: 'Fictional Instructor', role: 'instructor' };
function flags(db: Database, homework: boolean, medals = false, resumeReviewed = false) {
  return v3CommandInput.parse({
    action: 'center-features',
    expectedVersion: centerFeatures(db).version,
    homework,
    medals,
    resumeReviewed,
  });
}
function activity(db: Database, subject = 'Math', index = 0, kind = 'Worksheets') {
  const visit = db.visits.find((v) => v.studentId === db.students[index].id && isOpenVisit(v))!;
  return v3CommandInput.parse({
    action: 'activity-check-in',
    visitId: visit.id,
    subject,
    activity: kind,
    expectedAt: null,
    expectedFeaturesVersion: centerFeatures(db).version,
    text: 'Fictional visit note',
    skillRatings: [{ id: 'focus', label: 'Focus', score: 4 }],
  });
}
function packetState(db: Database) {
  return structuredClone({
    assignments: db.operations!.assignments,
    students: db.operations!.students,
    completions: db.operations!.completions,
    decisions: db.operations!.decisions,
    medals: db.operations!.achievements,
    homework: db.homework,
  });
}

test('existing centers default to both features enabled; settings round-trip without rewriting records', () => {
  const db = quickViewDemo(now),
    before = packetState(db);
  assert.deepEqual(centerFeatures(db), {
    homework: true,
    medals: true,
    version: 0,
  });
  applyV3(db, flags(db, false), owner, now);
  synchronizePreparation(db, '2027-03-01');
  assert.deepEqual(packetState(db), before);
  const restored = JSON.parse(JSON.stringify(db));
  validateDatabase(restored);
  assert.deepEqual(centerFeatures(restored), {
    homework: false,
    medals: false,
    version: 1,
  });
  assert.throws(() => applyV3(db, flags(db, true), owner, now), /Review current/);
  applyV3(db, flags(db, true, true, true), owner, now);
  assert.deepEqual(packetState(db), before);
  assert.deepEqual(centerFeatures(db), {
    homework: true,
    medals: true,
    version: 2,
  });
});

test('feature settings enforce owner role and expected version', () => {
  const db = quickViewDemo(now);
  for (const role of ['instructor', 'assistant'] as const)
    assert.throws(
      () => applyV3(db, flags(db, false), { name: 'Fictional Staff', role }, now),
      /Only the owner/,
    );
  const old = flags(db, false);
  applyV3(db, old, owner, now);
  assert.throws(() => applyV3(db, old, owner, now), /features changed/);
  const stale = activity(db);
  applyV3(db, flags(db, false, true), owner, now);
  assert.throws(() => applyV3(db, stale, teacher, now), /features changed/);
});

for (const kind of ['Worksheets', 'Corrections only', 'Both'])
  test(
    'activity-only ' +
      kind +
      ' preserves attendance, plans and progression and saves both subjects independently',
    () => {
      const db = quickViewDemo(now);
      applyV3(db, flags(db, false), owner, now);
      const before = packetState(db),
        v = db.visits.find((v) => v.studentId === db.students[0].id && isOpenVisit(v))!;
      const attendanceBefore = [v.arrivedAt, v.departedAt, v.closedAt, v.departureVerified];
      applyV3(db, activity(db, 'Math', 0, kind), teacher, now);
      assert.equal(Boolean(v.handoff), false);
      assert.equal(v.subjectCheckIns?.Math?.mode, 'activity-only');
      applyV3(db, activity(db, 'Reading', 0, kind), teacher, now);
      assert.equal(v.handoff?.mode, 'activity-only');
      assert.deepEqual(v.handoff.assignmentIds, []);
      assert.equal(v.sessionRecords?.length, 2);
      for (const r of v.sessionRecords!) {
        assert.equal(r.activity, kind);
        assert.equal(r.format, 'Paper');
        assert.equal(r.mode, 'activity-only');
        assert.deepEqual([r.incoming, r.center, r.outgoing], [[], null, []]);
      }
      assert.deepEqual(
        [v.arrivedAt, v.departedAt, v.closedAt, v.departureVerified],
        attendanceBefore,
      );
      assert.deepEqual(packetState(db), before);
      assert.equal(db.observations.at(-1)?.skillRatings?.[0].score, 4);
      assert.equal(db.observations.at(-1)?.text, 'Fictional visit note');
      assert.throws(() => applyV3(db, activity(db, 'Math'), teacher, now), /Check-in changed/);
      applyV3(
        db,
        v3CommandInput.parse({
          ...activity(db),
          expectedAt: v.subjectCheckIns!.Math!.at,
          correctionReason: 'Fictional activity correction',
          activity: 'Both',
          text: '',
        }),
        teacher,
        new Date(now.getTime() + 60000),
      );
      assert.equal(v.sessionRecords?.length, 3);
      assert.deepEqual(packetState(db), before);
    },
  );

test('activity mode supports CONNECT, repeat visits, rejects assistants and departed activity saves', () => {
  const db = quickViewDemo(now);
  applyV3(db, flags(db, false), owner, now);
  const cmd = activity(db, 'Reading', 1),
    v = db.visits.find((v) => v.id === ('visitId' in cmd ? cmd.visitId : ''))!;
  assert.throws(
    () => applyV3(db, cmd, { name: 'Fictional Assistant', role: 'assistant' }, now),
    /instructor/,
  );
  applyV3(db, cmd, teacher, now);
  assert.equal(v.sessionRecords?.at(-1)?.format, 'CONNECT');
  attendance(db, v.studentId, 'out', now, teacher.name);
  assert.throws(
    () =>
      applyV3(
        db,
        v3CommandInput.parse({ ...cmd, subject: 'Math', expectedAt: null }),
        teacher,
        now,
      ),
    /departed/,
  );
  attendance(db, v.studentId, 'in', new Date(now.getTime() + 60000), teacher.name);
  applyV3(db, activity(db, 'Math', 1), teacher, new Date(now.getTime() + 60000));
  assert.equal(
    db.visits.filter(
      (x) =>
        x.studentId === v.studentId && x.sessionRecords?.some((r) => r.mode === 'activity-only'),
    ).length,
    2,
  );
});

test('disabled packet and medal commands are rejected on V1, V2 and V3 paths', () => {
  const db = quickViewDemo(now);
  applyV3(db, flags(db, false), owner, now);
  const a = db.operations!.assignments.find((a) => a.v3 && !a.v3.issuedAt)!;
  assert.throws(
    () =>
      applyV3(
        db,
        v3CommandInput.parse({
          action: 'prepare',
          ids: [a.id],
          versions: { [a.id]: a.v3!.version },
        }),
        owner,
        now,
      ),
    /turned off/,
  );
  assert.throws(
    () =>
      applyV2(
        db,
        v2CommandInput.parse({
          action: 'plan',
          studentId: a.studentId,
          subject: a.subject,
          fromDate: '2026-10-12',
        }),
        owner,
        now,
      ),
    /turned off/,
  );
  assert.throws(
    () =>
      applyV2(
        db,
        v2CommandInput.parse({
          action: 'achievement',
          studentId: a.studentId,
          subject: a.subject,
          distinction: 'Gold',
          date: '2026-10-12',
        }),
        owner,
        now,
      ),
    /turned off/,
  );
  assert.throws(
    () =>
      applyCommand(
        db,
        {
          kind: 'homework',
          studentId: a.studentId,
          description: 'Fictional paper packet',
        },
        owner,
        now,
      ),
    /turned off/,
  );
  applyV3(db, flags(db, true, false, true), owner, now);
  assert.throws(() => applyV3(db, activity(db), teacher, now), /features changed/);
});

test('activity-only revisions do not erase prior packet review evidence', () => {
  const db = quickViewDemo(now),
    s = db.students[0];
  const v = db.visits.find((v) => v.studentId === s.id && v.sessionRecords?.length)!;
  const before = homeworkReviews(db, s.id, 'Math');
  v.sessionRecords!.push({
    ...v.sessionRecords![0],
    mode: 'activity-only',
    incoming: [],
    center: null,
    outgoing: [],
    at: now.toISOString(),
  });
  assert.deepEqual(homeworkReviews(db, s.id, 'Math'), before);
});

test('malformed feature flags fail closed rather than restoring defaults', () => {
  const db = quickViewDemo(now);
  db.operations!.v3!.features = {
    homework: 'no',
    medals: false,
    version: 1,
  } as never;
  assert.throws(() => validateDatabase(db), /Invalid center feature/);
});

test('resuming homework does not treat an activity-only confirmation as physical issuance', () => {
  const db = quickViewDemo(now);
  applyV3(db, flags(db, false), owner, now);
  const cmd = activity(db),
    v = db.visits.find((v) => v.id === ('visitId' in cmd ? cmd.visitId : ''))!;
  applyV3(db, cmd, teacher, now);
  applyV3(db, flags(db, true, true, true), owner, now);
  const a = db.operations!.assignments.find(
    (a) => a.studentId === v.studentId && a.subject === 'Math' && a.v3 && !a.v3.issuedAt,
  )!;
  assert.equal(a.v3!.issuedAt, null);
  const normal = v3CommandInput.parse({
    action: 'handoff',
    expectedFeaturesVersion: centerFeatures(db).version,
    subject: 'Math',
    activity: 'Worksheets',
    visitId: v.id,
    expectedAt: null,
    subjects: [
      {
        subject: 'Math',
        assignmentId: a.id,
        version: a.v3!.version,
        activity: 'Worksheets',
        exception: false,
        incoming: [],
        actual: null,
        repeat: null,
        physicalConfirmed: true,
        reason: '',
      },
    ],
    choices: [],
    text: '',
    followUp: false,
  });
  assert.throws(
    () =>
      applyV3(db, v3CommandInput.parse({ ...normal, expectedFeaturesVersion: 0 }), teacher, now),
    /features changed/,
  );
  applyV3(db, normal, teacher, new Date(now.getTime() + 60000));
  assert.ok(a.v3!.issuedAt);
  assert.equal(v.sessionRecords![0].mode, 'activity-only');
  assert.equal(v.sessionRecords!.at(-1)!.mode, undefined);
});

test('stale profile forms cannot change packet settings while homework is off', () => {
  const db = quickViewDemo(now);
  applyV3(db, flags(db, false), owner, now);
  const s = db.students[0],
    settings = structuredClone(db.operations!.students[s.id]);
  settings.subjects.Math.nextStart++;
  assert.throws(
    () =>
      applyV3(
        db,
        v3CommandInput.parse({
          action: 'student-save',
          studentId: s.id,
          name: s.name,
          earlyLearner: s.earlyLearner,
          settings,
          enrollmentDate: settings.enrollmentDate,
          visitDays: [1, 4],
          tiles: [],
          goals: '',
        }),
        teacher,
        now,
      ),
    /turned off/,
  );
});
