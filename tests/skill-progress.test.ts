import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import {
  skillSeries,
  skillScatter,
  skillAverage,
  skillColors,
  skillDailyAverages,
} from '../src/lib/skill-progress';
import type { Observation } from '../src/lib/model';
function scenario() {
  const db = quickViewDemo(new Date('2026-10-12T21:00:00Z')),
    student = db.students[0];
  db.observations = [];
  db.operations!.students[student.id].observationSkills = [
    { id: 'focus', label: 'Concentration' },
    { id: 'new', label: 'Confidence' },
  ];
  const observation = (
    id: string,
    day: string,
    ratings: Observation['skillRatings'],
  ): Observation => ({
    id,
    studentId: student.id,
    visitId: null,
    choices: [],
    text: 'Original note',
    followUp: false,
    createdAt: day + 'T21:00:00Z',
    author: 'Fictional Instructor',
    reviewedAt: null,
    reviewedBy: null,
    skillRatings: ratings,
  });
  return { db, student, observation };
}
test('skills use stable IDs and configured order; removed, renamed, and replacement histories remain distinct', () => {
  const { db, student, observation } = scenario();
  db.observations.push(
    observation('one', '2026-10-05', [
      { id: 'focus', label: 'Focus', score: 2 },
      { id: 'old', label: 'Confidence', score: 4 },
    ]),
  );
  db.observations.push(
    observation('two', '2026-10-06', [
      { id: 'focus', label: 'Concentration', score: 3 },
      { id: 'new', label: 'Confidence', score: 5 },
    ]),
  );
  const before = JSON.stringify(db),
    series = skillSeries(db, student.id);
  assert.deepEqual(
    series.map((s) => [s.id, s.label, s.active]),
    [
      ['focus', 'Concentration', true],
      ['new', 'Confidence', true],
      ['old', 'Confidence', false],
    ],
  );
  assert.deepEqual(
    series[0].records.map((r) => r.label),
    ['Focus', 'Concentration'],
  );
  assert.equal(series[1].records.length, 1);
  assert.equal(series[2].records.length, 1);
  assert.equal(JSON.stringify(db), before);
  db.operations!.students[student.id].observationSkills!.reverse();
  assert.equal(skillSeries(db, student.id)[0].id, 'new');
});
test('edited observations contribute once on their original date, including score removal', () => {
  const { db, student, observation } = scenario();
  const o = observation('one', '2026-10-05', [{ id: 'focus', label: 'Focus', score: 1 }]);
  o.revisions = [
    {
      at: '2026-10-20T21:00:00Z',
      actor: 'Fictional Reviewer',
      text: 'Updated',
      skillRatings: [{ id: 'focus', label: 'Focus', score: 4 }],
    },
  ];
  db.observations.push(o);
  let records = skillSeries(db, student.id)[0].records;
  assert.equal(records.length, 1);
  assert.equal(records[0].day, '2026-10-05');
  assert.equal(records[0].score, 4);
  assert.equal(records[0].actor, 'Fictional Reviewer');
  o.revisions.push({
    at: '2026-10-21T21:00:00Z',
    actor: 'Fictional Reviewer',
    text: 'Note only',
    skillRatings: [],
  });
  records = skillSeries(db, student.id)[0].records;
  assert.equal(records.length, 0);
  assert.equal(o.skillRatings![0].score, 1);
});
test('simultaneous skills stay separate and legacy subject-scoped ratings are never pooled', () => {
  const { db, student, observation } = scenario();
  db.observations.push(
    observation('one', '2026-10-05', [
      { id: 'focus', label: 'Focus', score: 2 },
      { id: 'new', label: 'Confidence', score: 5 },
    ]),
  );
  db.observations.push({
    ...observation('math', '2026-10-05', [{ id: 'focus', label: 'Focus', score: 1 }]),
    subject: 'Math',
  });
  const series = skillSeries(db, student.id);
  assert.equal(series.length, 3);
  assert.deepEqual(
    series.map((s) => s.records[0].score),
    [2, 5, 1],
  );
  assert.equal(series[2].scope, 'Math');
  assert.notEqual(series[0].key, series[2].key);
});
test('unset and invalid scores never become zero or enter averages; empty settings preserve previous skills', () => {
  const { db, student, observation } = scenario();
  db.operations!.students[student.id].observationSkills = [];
  db.observations.push(
    observation('one', '2026-10-05', [
      { id: 'focus', label: 'Focus', score: 0 },
      { id: 'bad', label: 'Bad', score: 6 },
      { id: 'fraction', label: 'Fraction', score: 2.5 },
      { id: 'valid', label: 'Valid', score: 3 },
    ]),
  );
  const series = skillSeries(db, student.id);
  assert.equal(series.length, 1);
  assert.equal(series[0].active, false);
  assert.equal(skillAverage(series[0].records), 3);
  assert.equal(skillAverage([]), null);
});
test('scatter retains only recorded dots, connects across missing dates, and averages all actual ratings', () => {
  const { db, student, observation } = scenario();
  for (const [i, day, score] of [
    [0, '2026-10-05', 1],
    [1, '2026-10-06', 4],
    [2, '2026-10-19', 5],
  ] as const)
    db.observations.push(observation(String(i), day, [{ id: 'focus', label: 'Focus', score }]));
  const records = skillSeries(db, student.id)[0].records;
  const points = skillScatter(records, '2026-10-01', '2026-10-31', 'America/Los_Angeles');
  assert.equal(points.length, 3);
  assert.ok(points[2].x > points[1].x);
  assert.ok(points.every((p) => p.x > 0 && p.x < 100));
  assert.equal(skillAverage(points), 10 / 3);
  assert.equal(
    skillAverage(skillScatter(records, '2026-10-05', '2026-10-11', 'America/Los_Angeles')),
    2.5,
  );
  assert.equal(skillAverage([]), null);
  assert.equal(skillScatter(records, '2026-09-01', '2026-09-30', 'America/Los_Angeles').length, 0);
});
test('scatter aligns simultaneous skills by timestamp, preserves same-day ratings and uses center-local boundaries', () => {
  const { db, student, observation } = scenario();
  db.operations!.center.timezone = 'America/Los_Angeles';
  db.observations.push({
    ...observation('one', '2026-10-05', [
      { id: 'focus', label: 'Focus', score: 2 },
      { id: 'new', label: 'Confidence', score: 3 },
    ]),
    createdAt: '2026-10-06T01:00:00Z',
  });
  db.observations.push(
    observation('two', '2026-10-05', [{ id: 'focus', label: 'Focus', score: 4 }]),
  );
  const series = skillSeries(db, student.id),
    focus = skillScatter(series[0].records, '2026-10-05', '2026-10-11', 'America/Los_Angeles'),
    confidence = skillScatter(series[1].records, '2026-10-05', '2026-10-11', 'America/Los_Angeles');
  assert.equal(focus.length, 2);
  assert.ok(focus.every((p) => p.day === '2026-10-05'));
  assert.equal(focus[1].x, confidence[0].x);
  assert.notEqual(focus[0].x, focus[1].x);
  const colors = skillColors(series),
    reordered = skillColors(series.toReversed());
  assert.deepEqual([...colors].sort(), [...reordered].sort());
  assert.notEqual(colors.get(series[0].key), colors.get(series[1].key));
});

import {
  addInteractiveProgressStudent,
  progressStudentId,
} from './fixtures/interactive-progress-student';
import { addFictionalSkillRatings } from './fixtures/skill-progress-demo';
test('fictional skill examples are additive, idempotent and preserve all original records', () => {
  const now = new Date('2026-10-12T21:00:00Z'),
    db = quickViewDemo(now);
  addInteractiveProgressStudent(db, now);
  const before = structuredClone(db),
    count = addFictionalSkillRatings(db, now);
  assert.ok(count > 30);
  assert.deepEqual(db.visits, before.visits);
  assert.deepEqual(db.operations, before.operations);
  assert.deepEqual(db.students, before.students);
  assert.deepEqual(db.observations.slice(0, before.observations.length), before.observations);
  const series = skillSeries(db, progressStudentId);
  assert.equal(series.filter((s) => s.active && s.records.length).length, 3);
  assert.ok(series.some((s) => !s.active && s.label === 'Organization'));
  const stopped = series.find((s) => s.id === 'fictional-preparation')!,
    started = series.find((s) => s.id === 'fictional-confidence')!;
  assert.ok(stopped.records.length > 1 && started.records.length > 1);
  assert.ok(stopped.records.at(-1)!.at < started.records[0].at);
  const stoppedDots = skillScatter(
    stopped.records,
    '2026-08-01',
    '2026-10-12',
    db.operations!.center.timezone,
  );
  const startedDots = skillScatter(
    started.records,
    '2026-08-01',
    '2026-10-12',
    db.operations!.center.timezone,
  );
  assert.ok(stoppedDots.at(-1)!.x < startedDots[0].x);
  assert.equal(addFictionalSkillRatings(db, now), 0);
  db.operations!.center.name = 'Unlabeled';
  db.audit = db.audit.filter((a) => !a.id.startsWith('fictional-rowan-skill-ratings'));
  assert.throws(() => addFictionalSkillRatings(db, now));
});

test('overall skill trend averages every actual rating per day without filling missing days', () => {
  const { db, student, observation } = scenario();
  db.observations.push(
    observation('one', '2026-10-05', [
      { id: 'focus', label: 'Focus', score: 1 },
      { id: 'new', label: 'Confidence', score: 5 },
    ]),
  );
  db.observations.push(
    observation('two', '2026-10-05', [{ id: 'focus', label: 'Focus', score: 3 }]),
  );
  db.observations.push(
    observation('three', '2026-10-09', [{ id: 'new', label: 'Confidence', score: 4 }]),
  );
  const series = skillSeries(db, student.id),
    points = series.flatMap((s) =>
      skillScatter(s.records, '2026-10-01', '2026-10-31', 'America/Los_Angeles'),
    );
  const before = JSON.stringify(points),
    average = skillDailyAverages(points);
  assert.equal(average.length, 2);
  assert.deepEqual(
    average.map((p) => p.score),
    [3, 4],
  );
  assert.deepEqual(
    average.map((p) => p.day),
    ['2026-10-05', '2026-10-09'],
  );
  assert.equal(average[0].records.length, 3);
  assert.equal(JSON.stringify(points), before);
  assert.equal(skillDailyAverages(points.filter((p) => p.day === '2026-10-09'))[0].score, 4);
  assert.deepEqual(skillDailyAverages([]), []);
});
