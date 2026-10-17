import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { applyV3, v3CommandInput, type V3Command } from '../src/lib/v3-domain';
import {
  currentSets,
  incomingPackets,
  subjectPlan,
  repeatSequence,
  reuseSequence,
} from '../src/lib/v3-planning';
import { isOpenVisit, type Database, type Staff, type Visit } from '../src/lib/model';
import type { Subject } from '../src/lib/v2-model';
const now = new Date('2026-10-12T21:00:00Z'),
  teacher: Staff = { name: 'Fictional Instructor', role: 'instructor' };
function command(db: Database, visit: Visit, subject: Subject) {
  return v3CommandInput.parse({
    action: 'handoff',
    subject,
    activity: 'Worksheets',
    visitId: visit.id,
    expectedAt: null,
    subjects: currentSets(db, visit)
      .filter((a) => a.subject === subject)
      .map((a) => ({
        subject,
        assignmentId: a.id,
        version: a.v3!.version,
        activity: 'Worksheets',
        exception: false,
        incoming: [],
        actual: null,
        repeat: null,
        physicalConfirmed: true,
        reason: '',
      })),
    choices: [],
    text: '',
    followUp: false,
    correctionReason: '',
  }) as Extract<V3Command, { action: 'handoff' }>;
}
function visit(db: Database, index = 0) {
  return db.visits.find((v) => v.studentId === db.students[index].id && isOpenVisit(v))!;
}

for (const startWith of ['today', 'homework'] as const) {
  test(
    'confirmed repeat beginning with ' +
      startWith +
      ' rebuilds by ranges and reuses unfinished packets',
    () => {
      const db = quickViewDemo(now),
        v = visit(db),
        a = currentSets(db, v).find((a) => a.subject === 'Math')!,
        prior = incomingPackets(db, v.studentId, 'Math');
      prior[0].range = { level: 'D', start: 41, end: 45 };
      prior[1].range = { level: 'D', start: 51, end: 55 };
      const c = command(db, v, 'Math'),
        cursor = db.operations!.students[v.studentId].subjects.Math.nextStart;
      c.subjects[0].incoming = prior.map((p) => ({ id: p.id, state: 'unfinished' }));
      c.subjects[0].exception = true;
      c.subjects[0].repeat = {
        level: 'D',
        start: 31,
        packetsPerDay: startWith === 'today' ? 1 : 2,
        sheetsPerPacket: 5,
        restart: false,
        startWith,
        reason: 'Fictional deliberate repeat',
      };
      // Homework-only keeps the current center packet, avoiding any overlap with the rebuilt homework.
      if (startWith === 'homework')
        c.subjects[0].center = { ...a.v3!.inCenter!, range: { level: 'D', start: 21, end: 25 } };
      applyV3(db, c, teacher, now);
      assert.equal(a.v3!.inCenter!.range.start, startWith === 'today' ? 31 : 21);
      assert.deepEqual(
        a.v3!.issued.map((p) => p.range.start),
        startWith === 'today' ? [36, 41] : [31, 36, 41, 46],
      );
      assert.equal(a.v3!.issued.find((p) => p.range.start === 41)!.id, prior[0].id);
      assert.equal(
        a.v3!.issued.find((p) => p.range.start === 41)!.sourceAssignmentId,
        prior[0].sourceAssignmentId,
      );
      assert.ok(a.v3!.held.some((p) => p.id === prior[1].id));
      assert.ok(
        db.operations!.assignments.some((x) =>
          x.v3!.reconciliations.some((r) => r.packetId === prior[1].id && r.state === 'unfinished'),
        ),
      );
      assert.deepEqual(incomingPackets(db, v.studentId, 'Math', a.id), []);
      assert.equal(db.operations!.students[v.studentId].subjects.Math.nextStart, cursor);
      assert.equal(v.departedAt, null);
      assert.equal(db.operations!.completions.length, 0);
      const future = repeatSequence(
        db,
        a,
        { level: 'D', start: 46, packetsPerDay: 1, sheetsPerPacket: 5, startWith: 'today' },
        'Worksheets',
        a.v3!.inCenter,
      )!;
      assert.equal(future.v3!.planned[0].id, prior[1].id);
    },
  );
}

test("homework-only repeat keeps today's packet and corrections-only repeat creates no classwork", () => {
  const db = quickViewDemo(now),
    v = visit(db),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    original = structuredClone(a.v3!.inCenter!);
  const plan = {
    level: 'D',
    start: 1,
    packetsPerDay: 1,
    sheetsPerPacket: 5,
    startWith: 'homework' as const,
  };
  const homework = repeatSequence(db, a, plan, 'Both', original)!;
  assert.equal(homework.v3!.inCenter!.id, original.id);
  assert.deepEqual(
    homework.v3!.planned.map((p) => p.range.start),
    [1, 6],
  );
  const c = command(db, v, 'Math');
  c.subjects[0].activity = 'Corrections only';
  c.subjects[0].repeat = {
    ...plan,
    startWith: 'today',
    restart: false,
    reason: 'Fictional corrections-only review',
  };
  applyV3(db, c, teacher, now);
  assert.equal(a.v3!.inCenter, null);
  assert.deepEqual(
    a.v3!.issued.map((p) => p.range.start),
    [1, 6],
  );
});

test('explicit center adjustment replaces unfinished priority without losing the set-aside packet', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    prior = incomingPackets(db, v.studentId, 'Math'),
    c = command(db, v, 'Math');
  c.subjects[0].incoming = prior.map((p) => ({ id: p.id, state: 'unfinished' }));
  c.subjects[0].exception = true;
  c.subjects[0].reason = 'Fictional explicit change of today’s packet';
  c.subjects[0].center = { ...a.v3!.inCenter!, range: { level: 'D', start: 61, end: 65 } };
  c.subjects[0].actual = a.v3!.planned.map((p, i) => ({
    ...p,
    range: { level: 'D', start: 66 + 5 * i, end: 70 + 5 * i },
  }));
  const originalId = a.v3!.inCenter!.id;
  applyV3(db, c, teacher, now);
  assert.equal(a.v3!.inCenter!.range.start, 61);
  assert.notEqual(a.v3!.inCenter!.id, originalId);
  assert.ok(a.v3!.held.some((p) => p.id === originalId));
  assert.ok(prior.every((p) => a.v3!.held.some((q) => q.id === p.id)));
  assert.deepEqual(
    a.v3!.issued.map((p) => p.range.start),
    [66, 71],
  );
  assert.equal(db.operations!.completions.length, 0);
});

test("confirmed homework-only adjustment keeps today's packet and retains removed unfinished work as held", () => {
  const db = quickViewDemo(now),
    v = visit(db),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    prior = incomingPackets(db, v.studentId, 'Math'),
    c = command(db, v, 'Math');
  c.subjects[0].incoming = prior.map((p) => ({ id: p.id, state: 'unfinished' }));
  c.subjects[0].exception = true;
  const reviewed = subjectPlan(
    db,
    a,
    'Worksheets',
    prior.map((p) => ({ ...p, status: 'unfinished' })),
  );
  c.subjects[0].center = reviewed.center;
  c.subjects[0].actual = reviewed.out.filter((p) => p.id !== prior[1].id);
  c.subjects[0].reason = 'Fictional removal from outgoing homework';
  applyV3(db, c, teacher, now);
  assert.equal(a.v3!.inCenter!.id, prior[0].id);
  assert.deepEqual(
    a.v3!.issued.map((p) => p.id),
    c.subjects[0].actual!.map((p) => p.id),
  );
  assert.ok(a.v3!.held.some((p) => p.id === prior[1].id));
  assert.ok(
    db.operations!.assignments.some((x) =>
      x.v3!.reconciliations.some((r) => r.packetId === prior[1].id && r.state === 'unfinished'),
    ),
  );
  assert.equal(v.departedAt, null);
  assert.equal(db.operations!.completions.length, 0);
});

test('rebuilt plans reject overlaps, unknown levels, missing work reuse and shared pending packet identities', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    original = a.v3!.inCenter!;
  assert.match(reuseSequence(db, a, original, [original]).review.join(' '), /more than one/);
  assert.match(
    repeatSequence(
      db,
      a,
      { level: 'Unknown', start: 1, packetsPerDay: 0, sheetsPerPacket: 5, startWith: 'homework' },
      'Corrections only',
      null,
    )!.v3!.review.join(' '),
    /approved worksheet boundary/,
  );
  const c = command(db, v, 'Math');
  c.subjects[0].center = original;
  assert.throws(() => applyV3(db, c, teacher, now), /reason/);
  const missing = { ...original, id: 'fictional-missing', status: 'missing' as const };
  const planned = reuseSequence(db, a, null, [{ ...original, id: 'fictional-new' }], [missing]);
  assert.notEqual(planned.out[0].id, missing.id);
  const held = {
    ...original,
    id: 'fictional-reserved-held',
    status: 'held' as const,
    range: { level: 'D', start: 81, end: 85 },
  };
  a.v3!.held.push(held);
  const reserved = structuredClone(a);
  reserved.id = 'fictional-other-pending';
  reserved.v3!.inCenter = held;
  reserved.v3!.planned = [];
  db.operations!.assignments.push(reserved);
  const resolved = reuseSequence(db, a, null, [
    { ...held, id: 'fictional-new-pull', prepared: false },
  ]);
  assert.notEqual(resolved.out[0].id, held.id);
});
test('subject check-ins issue independently, retain attribution and only complete the visit after both subjects', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    before = structuredClone(v),
    reading = structuredClone(currentSets(db, v).find((a) => a.subject === 'Reading')!),
    mathCommand = command(db, v, 'Math');
  applyV3(db, mathCommand, teacher, now);
  assert.ok(v.subjectCheckIns?.Math);
  assert.equal(v.subjectCheckIns?.Reading, undefined);
  assert.equal(v.handoff, undefined);
  assert.equal(v.departedAt, before.departedAt);
  assert.equal(v.arrivedAt, before.arrivedAt);
  assert.equal(db.operations!.assignments.find((a) => a.id === reading.id)!.v3!.issuedAt, null);
  assert.equal(currentSets(db, v).filter((a) => a.subject === 'Math').length, 1);
  assert.throws(() => applyV3(db, mathCommand, teacher, now), /changed/);
  applyV3(
    db,
    command(db, v, 'Reading'),
    { ...teacher, name: 'Second Fictional Instructor' },
    new Date(now.getTime() + 60000),
  );
  assert.equal(v.handoff!.assignmentIds.length, 2);
  assert.equal(v.subjectCheckIns!.Math!.actor, teacher.name);
  assert.equal(v.subjectCheckIns!.Reading!.actor, 'Second Fictional Instructor');
  assert.equal(db.operations!.completions.length, 0);
});
test('earliest returned packet becomes the single center packet and shifts new homework', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    incoming = incomingPackets(db, v.studentId, 'Math')[0],
    c = command(db, v, 'Math');
  const originalCenter = a.v3!.inCenter!,
    displaced = a.v3!.planned.at(-1)!;
  c.subjects[0].exception = true;
  c.subjects[0].incoming = [{ id: incoming.id, state: 'unfinished' }];
  applyV3(db, c, teacher, now);
  assert.equal(a.v3!.inCenterReturns![0].id, incoming.id);
  assert.equal(a.v3!.inCenterReturns![0].sourceAssignmentId, incoming.sourceAssignmentId);
  assert.equal(a.v3!.issued.length, a.v3!.planned.length);
  assert.ok(!a.v3!.issued.some((p) => p.id === incoming.id));
  assert.equal(a.v3!.inCenter!.id, incoming.id);
  assert.equal(a.v3!.issued[0].id, originalCenter.id);
  assert.ok(a.v3!.held.some((p) => p.id === displaced.id));
  assert.equal(db.operations!.completions.length, 0);
});

for (const activity of ['Worksheets', 'Both', 'Corrections only'] as const) {
  test(
    activity + ': multiple unfinished packets shift in sequence with at most one center packet',
    () => {
      const db = quickViewDemo(now),
        v = visit(db),
        a = currentSets(db, v).find((a) => a.subject === 'Math')!,
        incoming = incomingPackets(db, v.studentId, 'Math'),
        originalCenter = structuredClone(a.v3!.inCenter!),
        c = command(db, v, 'Math');
      incoming[0].range = { level: 'D', start: 41, end: 45 };
      incoming[1].range = { level: 'D', start: 51, end: 55 };
      c.subjects[0].activity = activity;
      c.subjects[0].exception = true;
      c.subjects[0].incoming = [...incoming]
        .reverse()
        .map((p) => ({ id: p.id, state: 'unfinished' }));
      applyV3(db, c, teacher, now);
      if (activity === 'Corrections only') {
        assert.equal(a.v3!.inCenter, null);
        assert.deepEqual(
          a.v3!.issued.map((p) => p.id),
          incoming.map((p) => p.id),
        );
        assert.ok(a.v3!.held.some((p) => p.id === originalCenter.id));
      } else {
        assert.equal(a.v3!.inCenter!.id, incoming[0].id);
        assert.deepEqual(
          a.v3!.issued.map((p) => p.id),
          [incoming[1].id, originalCenter.id],
        );
        assert.equal(a.v3!.inCenterReturns!.length, 1);
      }
      assert.equal(a.v3!.issued.length, a.targetPackets);
      assert.equal(
        new Set([a.v3!.inCenter?.id, ...a.v3!.issued.map((p) => p.id)].filter(Boolean)).size,
        a.v3!.issued.length + (a.v3!.inCenter ? 1 : 0),
      );
      assert.ok(a.v3!.held.every((p) => !a.v3!.issued.some((q) => q.id === p.id)));
      assert.deepEqual(incomingPackets(db, v.studentId, 'Math', a.id), []);
      assert.equal(db.operations!.completions.length, 0);
      assert.equal(v.departedAt, null);
    },
  );
}

test('unfinished packets follow catalog level order before worksheet number, independent of selection order', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    packets = incomingPackets(db, v.studentId, 'Math');
  packets[0].range = { level: 'E', start: 1, end: 5 };
  packets[1].range = { level: 'D', start: 181, end: 185 };
  // Explicit fictional test boundary, not an approval of the real curriculum.
  const catalog = db.operations!.v3!.catalog;
  const e = catalog.find((c) => c.subject === 'Math' && c.id === 'E')!;
  Object.assign(e, { approved: true, first: 1, last: 200, source: 'Fictional test boundary' });
  const returned = packets.map((p) => ({ ...p, status: 'unfinished' as const })),
    plan = subjectPlan(db, a, 'Worksheets', returned);
  assert.deepEqual(plan.review, []);
  assert.equal(plan.center!.id, packets[1].id);
  assert.equal(plan.out[0].id, packets[0].id);
  assert.deepEqual(subjectPlan(db, a, 'Both', [...returned].reverse()), plan);
});

test('editing a saved shifted plan retains returned packet identities and held material', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    incoming = incomingPackets(db, v.studentId, 'Math'),
    c = command(db, v, 'Math');
  c.subjects[0].exception = true;
  c.subjects[0].incoming = incoming.map((p) => ({ id: p.id, state: 'unfinished' }));
  applyV3(db, c, teacher, now);
  const issued = a.v3!.issued.map((p) => p.id),
    center = a.v3!.inCenter!.id;
  const correction = command(db, v, 'Math');
  correction.expectedAt = v.subjectCheckIns!.Math!.at;
  correction.correctionReason = 'Fictional activity correction';
  correction.subjects[0].activity = 'Both';
  applyV3(db, correction, teacher, new Date(now.getTime() + 60000));
  assert.deepEqual(
    a.v3!.issued.map((p) => p.id),
    issued,
  );
  assert.equal(a.v3!.inCenter!.id, center);
  const corrections = command(db, v, 'Math');
  corrections.expectedAt = v.subjectCheckIns!.Math!.at;
  corrections.correctionReason = 'Fictional corrections-only change';
  corrections.subjects[0].activity = 'Corrections only';
  applyV3(db, corrections, teacher, new Date(now.getTime() + 120000));
  assert.equal(a.v3!.inCenter, null);
  assert.deepEqual(
    a.v3!.issued.map((p) => p.id),
    [center, issued[0]],
  );
  assert.ok(a.v3!.held.some((p) => p.id === issued[1]));
});

test('overflow is flagged rather than silently dropping unfinished packets; explicit extra homework preserves them', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    packets = incomingPackets(db, v.studentId, 'Math');
  a.v3!.planned = a.v3!.planned.slice(0, 1);
  const returned = packets.map((p) => ({ ...p, status: 'unfinished' as const }));
  assert.match(
    subjectPlan(db, a, 'Corrections only', returned).review.join(' '),
    /scheduled homework slots/,
  );
  const plan = subjectPlan(db, a, 'Corrections only', returned, 2);
  assert.deepEqual(plan.review, []);
  assert.deepEqual(
    plan.out.map((p) => p.id),
    packets.map((p) => p.id),
  );
});

test("unknown incoming curriculum and an outgoing duplicate of today's packet are rejected", () => {
  const db = quickViewDemo(now),
    v = visit(db),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    packets = incomingPackets(db, v.studentId, 'Math');
  assert.match(
    subjectPlan(db, a, 'Worksheets', [
      { ...packets[0], status: 'unfinished', range: { level: 'Unknown', start: 1, end: 5 } },
    ]).review.join(' '),
    /approved worksheet boundary/,
  );
  const c = command(db, v, 'Math');
  c.subjects[0].actual = [{ ...a.v3!.inCenter!, purpose: 'homework' }];
  assert.throws(() => applyV3(db, c, teacher, now), /cannot also be outgoing/);
});

test('correcting one legacy subject preserves the other confirmation and original attribution', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    legacy = command(db, v, 'Math');
  legacy.subject = undefined;
  legacy.subjects.push(...command(db, v, 'Reading').subjects);
  applyV3(db, legacy, teacher, now);
  const original = structuredClone(v.handoff!),
    correction = command(db, v, 'Math');
  correction.expectedAt = original.at;
  correction.correctionReason = 'Fictional Math correction';
  correction.subjects[0].activity = 'Both';
  applyV3(
    db,
    correction,
    { ...teacher, name: 'Second Fictional Instructor' },
    new Date(now.getTime() + 60000),
  );
  assert.equal(v.subjectCheckIns!.Reading!.activities.Reading, 'Worksheets');
  assert.equal(v.handoff!.activities.Reading, 'Worksheets');
  assert.equal(v.handoff!.activities.Math, 'Both');
  assert.equal(v.handoff!.at, original.at);
  assert.equal(v.handoff!.actor, original.actor);
  assert.equal(v.handoff!.assignmentIds.length, 2);
});

test('manual packet changes preserve the original physical packet as held', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    c = command(db, v, 'Math'),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    original = structuredClone(a.v3!.planned[0]);
  c.subjects[0].actual = a.v3!.planned.map((p, i) =>
    i
      ? p
      : {
          ...p,
          id: 'fictional-adjusted-packet',
          range: { level: 'D', start: 80, end: 84 },
          prepared: false,
        },
  );
  c.subjects[0].reason = 'Fictional explicit adjustment';
  applyV3(db, c, teacher, now);
  assert.deepEqual(a.v3!.held.find((p) => p.id === original.id)!.range, original.range);
  assert.deepEqual(a.v3!.issued[0].range, { level: 'D', start: 80, end: 84 });
});
test('schedule-based repeat creates both center and take-home packets, preserves held material and reason', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    a = currentSets(db, v).find((a) => a.subject === 'Math')!,
    oldCenter = a.v3!.inCenter!,
    cursor = db.operations!.students[v.studentId].subjects.Math.nextStart,
    c = command(db, v, 'Math');
  c.subjects[0].repeat = {
    level: 'D',
    start: 1,
    restart: false,
    packetsPerDay: 3,
    sheetsPerPacket: 4,
    reason: 'Fictional consolidation practice',
  };
  applyV3(db, c, teacher, now);
  assert.deepEqual(a.v3!.inCenter!.range, { level: 'D', start: 1, end: 4 });
  assert.equal(a.v3!.issued.length, 6);
  assert.deepEqual(a.v3!.issued[0].range, { level: 'D', start: 5, end: 8 });
  assert.ok(a.v3!.held.some((p) => p.id === oldCenter.id));
  assert.equal(db.operations!.students[v.studentId].subjects.Math.nextStart, cursor);
  assert.equal(db.operations!.decisions.at(-1)!.note, 'Fictional consolidation practice');
});
test('subject operations reject cross-subject changes, stale versions, invalid repeat bounds and assistants', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    c = command(db, v, 'Math');
  c.subjects[0].subject = 'Reading';
  assert.throws(() => applyV3(db, c, teacher, now), /selected subject/);
  const stale = command(db, v, 'Math');
  stale.subjects[0].version--;
  assert.throws(() => applyV3(db, stale, teacher, now), /changed/);
  const invalid = command(db, v, 'Math');
  invalid.subjects[0].repeat = {
    level: 'D',
    start: 199,
    restart: false,
    packetsPerDay: 2,
    sheetsPerPacket: 5,
    reason: 'Fictional invalid range',
  };
  assert.throws(() => applyV3(db, invalid, teacher, now), /valid range/);
  assert.throws(
    () => applyV3(db, command(db, v, 'Math'), { name: 'Assistant', role: 'assistant' }, now),
    /instructor/,
  );
});
test('CONNECT subject check-in creates no paper sets and preserves optional subject records through JSON round-trip', () => {
  const db = quickViewDemo(now),
    v = visit(db, 1),
    count = db.operations!.assignments.length;
  applyV3(db, command(db, v, 'Reading'), teacher, now);
  assert.deepEqual(v.subjectCheckIns!.Reading!.assignmentIds, []);
  assert.equal(v.handoff, undefined);
  assert.equal(db.operations!.assignments.length, count);
  assert.deepEqual(
    JSON.parse(JSON.stringify(db)).visits.find((entry: Visit) => entry.id === v.id).subjectCheckIns,
    v.subjectCheckIns,
  );
});

test('observational ratings are optional, bounded, attributed and preserve custom order', () => {
  const db = quickViewDemo(now),
    v = visit(db),
    cfg = db.operations!.students[v.studentId];
  const input = { action: 'observation', visitId: v.id, choices: [], text: '', followUp: false };
  const count = db.observations.length;
  applyV3(db, v3CommandInput.parse(input), teacher, now);
  assert.equal(db.observations.length, count);
  const skills = [
    { id: 'custom', label: 'Following instructions' },
    { id: 'focus', label: 'Focus' },
  ];
  applyV3(
    db,
    v3CommandInput.parse({
      ...input,
      skillSettings: { version: cfg.version, skills },
      skillRatings: [{ ...skills[1], score: 4 }],
    }),
    teacher,
    now,
  );
  assert.deepEqual(cfg.observationSkills, skills);
  const recorded = db.observations.at(-1)!;
  assert.deepEqual(recorded.skillRatings, [{ ...skills[1], score: 4 }]);
  assert.equal(recorded.author, teacher.name);
  assert.equal(recorded.visitId, v.id);
  for (const score of [0, 6, 1.5])
    assert.equal(
      v3CommandInput.safeParse({ ...input, skillRatings: [{ id: 'focus', label: 'Focus', score }] })
        .success,
      false,
    );
  assert.throws(
    () =>
      applyV3(
        db,
        v3CommandInput.parse({ ...input, skillSettings: { version: cfg.version - 1, skills: [] } }),
        teacher,
        now,
      ),
    /settings changed/,
  );
  assert.deepEqual(cfg.observationSkills, skills);
  assert.throws(
    () =>
      applyV3(
        db,
        v3CommandInput.parse(input),
        { name: 'Fictional assistant', role: 'assistant' },
        now,
      ),
    /instructor/,
  );
});
