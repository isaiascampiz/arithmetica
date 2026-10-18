import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { homeworkReviews, homeworkTotals, homeworkBuckets } from '../src/lib/homework-consistency';
import {
  addInteractiveProgressStudent,
  progressStudentId,
} from './fixtures/interactive-progress-student';
import { addFictionalHomeworkReviews } from './fixtures/homework-consistency-demo';
import type { SessionRecord } from '../src/lib/v3-model';
const now = new Date('2026-10-12T21:00:00Z');
function scenario() {
  const db = quickViewDemo(now),
    student = db.students[0];
  const packets = db.operations!.assignments.find(
    (a) => a.studentId === student.id && a.subject === 'Math' && a.v3?.issued.length,
  )!.v3!.issued;
  const record: SessionRecord = {
    subject: 'Math',
    at: '2026-10-05T21:00:00Z',
    actor: 'Fictional Instructor',
    format: 'Paper',
    activity: 'Worksheets',
    incoming: [
      { packet: structuredClone(packets[0]), outcome: 'assumed completed' },
      { packet: structuredClone(packets[1]), outcome: 'unfinished' },
    ],
    center: null,
    outgoing: [],
    reason: '',
  };
  db.visits = [
    {
      id: 'review-one',
      studentId: student.id,
      arrivedAt: record.at,
      departedAt: null,
      sessionRecords: [record],
    },
  ];
  return { db, student, record };
}
test('homework uses packet review outcomes, separate subjects and a weighted denominator without modifying evidence', () => {
  const { db, student, record } = scenario();
  record.incoming.push({
    packet: { ...structuredClone(record.incoming[0].packet), id: 'missing-packet' },
    outcome: 'missing',
  });
  db.visits[0].sessionRecords!.push({ ...structuredClone(record), subject: 'Reading' });
  const before = JSON.stringify(db);
  const reviews = homeworkReviews(db, student.id, 'Math');
  assert.deepEqual(homeworkTotals(reviews), {
    completed: 1,
    unfinished: 1,
    missing: 1,
    total: 3,
    reviews: 1,
    percent: (1 / 3) * 100,
  });
  assert.equal(reviews.length, 1);
  assert.equal(JSON.stringify(db), before);
  const extra = {
    ...structuredClone(reviews[0]),
    id: 'short-review',
    packets: [reviews[0].packets[0]],
  };
  assert.equal(homeworkTotals([...reviews, extra]).percent, 50); // 2/4, not mean(33%,100%).
});
test('a corrected subject snapshot replaces its earlier counts and keeps the initial review date', () => {
  const { db, student, record } = scenario();
  const revised = structuredClone(record);
  revised.at = '2026-10-06T21:00:00Z';
  revised.incoming[1].outcome = 'finished';
  revised.incoming.push(structuredClone(revised.incoming[0]));
  db.visits[0].sessionRecords!.push(revised);
  const reviews = homeworkReviews(db, student.id, 'Math');
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].day, '2026-10-05');
  assert.equal(homeworkTotals(reviews).total, 2);
  assert.equal(homeworkTotals(reviews).percent, 100);
});
test('reissued packets count again on a later physical visit, including repeat same-day visits', () => {
  const { db, student, record } = scenario();
  db.visits.push({
    ...structuredClone(db.visits[0]),
    id: 'review-two',
    sessionRecords: [{ ...structuredClone(record), at: '2026-10-05T23:00:00Z' }],
  });
  assert.equal(homeworkTotals(homeworkReviews(db, student.id, 'Math')).total, 4);
});
test('no incoming review is unknown rather than 0% or 100%; issuance and academic completion records do not supply outcomes', () => {
  const { db, student, record } = scenario();
  record.incoming = [];
  addInteractiveProgressStudent(db, now);
  assert.equal(homeworkTotals(homeworkReviews(db, student.id, 'Math')).percent, null);
  assert.equal(homeworkTotals(homeworkReviews(db, progressStudentId, 'Math')).percent, null);
  record.format = 'CONNECT';
  assert.equal(homeworkReviews(db, student.id, 'Math').length, 0);
});
test('weekly buckets include gaps, use center-local review dates, and never average percentages', () => {
  const { db, student } = scenario();
  const reviews = homeworkReviews(db, student.id, 'Math');
  const buckets = homeworkBuckets(reviews, '2026-09-28', '2026-10-18', 'week');
  assert.deepEqual(
    buckets.map((b) => b.percent),
    [null, 50, null],
  );
  assert.equal(buckets[1].total, 2);
  assert.deepEqual(
    homeworkBuckets(reviews, '2026-10-06', '2026-10-06', 'day').map((b) => b.percent),
    [null],
  );
});
test('fictional review additions preserve existing attendance, snapshots and academic ledger and are idempotent', () => {
  const db = quickViewDemo(now);
  addInteractiveProgressStudent(db, now);
  const before = structuredClone(db);
  assert.ok(addFictionalHomeworkReviews(db, now) > 70);
  assert.deepEqual(db.operations!.completions, before.operations!.completions);
  assert.deepEqual(db.operations!.assignments, before.operations!.assignments);
  assert.equal(db.visits.length, before.visits.length);
  for (const old of before.visits) {
    const updated = db.visits.find((v) => v.id === old.id)!;
    for (const key of Object.keys(old) as (keyof typeof old)[])
      assert.deepEqual(updated[key], old[key]);
  }
  const reviews = homeworkReviews(db, progressStudentId, 'Math');
  const total = homeworkTotals(reviews);
  assert.ok(total.percent! > 30 && total.percent! < 100);
  assert.ok(reviews.some((r) => homeworkTotals([r]).percent === 0));
  assert.ok(reviews.some((r) => homeworkTotals([r]).percent === 100));
  const packetIds = reviews.flatMap((r) => r.packets.map((p) => p.packet.id));
  assert.ok(new Set(packetIds).size < packetIds.length);
  const snapshot = JSON.stringify(db);
  assert.equal(addFictionalHomeworkReviews(db, now), 0);
  assert.equal(JSON.stringify(db), snapshot);
});
