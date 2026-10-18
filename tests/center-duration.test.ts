import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import {
  durationVisits,
  durationTotals,
  durationBuckets,
  durationAxis,
} from '../src/lib/center-duration';
import type { Visit } from '../src/lib/model';

const visit = (id: string, arrivedAt: string, minutes: number): Visit => ({
  id,
  studentId: 'duration-student',
  arrivedAt,
  departedAt: new Date(Date.parse(arrivedAt) + minutes * 60000).toISOString(),
  departureVerified: true,
});

test('duration keeps separate repeat visits and legacy physical departures, excluding open, automatic and unverified exits', () => {
  const db = quickViewDemo(new Date('2026-10-12T21:00:00Z'));
  db.visits = [
    visit('first', '2026-10-05T21:00:00Z', 30),
    visit('repeat', '2026-10-05T23:00:00Z', 60),
    { ...visit('legacy', '2026-10-06T21:00:00Z', 45), departureVerified: undefined },
    { ...visit('open', '2026-10-07T21:00:00Z', 15), departedAt: null },
    {
      ...visit('automatic', '2026-10-08T21:00:00Z', 120),
      departedAt: null,
      closedAt: '2026-10-09T05:00:00Z',
      departureVerified: false,
    },
    { ...visit('unverified', '2026-10-09T21:00:00Z', 80), departureVerified: false },
    { ...visit('other', '2026-10-05T21:00:00Z', 30), studentId: 'other' },
    visit('backwards', '2026-10-10T21:00:00Z', -30),
    { ...visit('bad-date', '2026-10-10T21:00:00Z', 30), departedAt: 'invalid' },
  ];
  const before = JSON.stringify(db);
  const records = durationVisits(db, 'duration-student');
  assert.deepEqual(
    records.map((r) => r.id),
    ['first', 'repeat', 'legacy'],
  );
  assert.deepEqual(durationTotals(records), { total: 135, count: 3, average: 45 });
  assert.equal(JSON.stringify(db), before);
});

test('duration uses center-local arrival dates and elapsed time across midnight and DST', () => {
  const db = quickViewDemo(new Date('2026-10-12T21:00:00Z'));
  db.operations!.center.timezone = 'America/Los_Angeles';
  db.visits = [
    visit('midnight', '2026-10-06T06:45:00Z', 60),
    visit('dst', '2026-11-01T08:30:00Z', 120),
  ];
  const records = durationVisits(db, 'duration-student');
  assert.equal(records[0].day, '2026-10-05');
  assert.equal(records[0].minutes, 60);
  assert.equal(records[1].minutes, 120);
});

test('headline duration weights individual visits rather than bucket averages and preserves gaps', () => {
  const db = quickViewDemo(new Date('2026-10-12T21:00:00Z'));
  db.visits = [
    visit('one', '2026-10-05T21:00:00Z', 30),
    visit('two', '2026-10-05T23:00:00Z', 30),
    visit('three', '2026-10-19T21:00:00Z', 90),
  ];
  const records = durationVisits(db, 'duration-student');
  const buckets = durationBuckets(records, '2026-10-05', '2026-10-25', 'week');
  assert.deepEqual(
    buckets.map((b) => b.average),
    [30, null, 90],
  );
  assert.equal(durationTotals(records).average, 50);
  assert.deepEqual(durationTotals([]), { total: 0, count: 0, average: null });
  const daily = durationBuckets(records, '2026-10-05', '2026-10-11', 'day');
  assert.equal(daily.length, 7);
  assert.equal(daily[0].count, 2);
  assert.equal(daily[0].average, 30);
  assert.equal(daily[1].average, null);
});

test('duration buckets clip calendar boundaries, handle leap months, and exclude outside records', () => {
  const db = quickViewDemo(new Date('2026-10-12T21:00:00Z'));
  db.visits = [
    visit('before', '2024-02-01T21:00:00Z', 20),
    visit('inside', '2024-02-29T21:00:00Z', 40),
    visit('after', '2024-03-05T21:00:00Z', 60),
  ];
  const buckets = durationBuckets(
    durationVisits(db, 'duration-student'),
    '2024-02-15',
    '2024-03-02',
    'month',
  );
  assert.deepEqual(
    buckets.map((b) => [b.start, b.end, b.average]),
    [
      ['2024-02-15', '2024-02-29', 40],
      ['2024-03-01', '2024-03-02', null],
    ],
  );
});

test('duration axes start at zero and never cap visits above 120 minutes', () => {
  const axis = durationAxis([30, 240, null]);
  assert.equal(axis.ticks[0], 0);
  assert.ok(axis.top >= 240);
  assert.equal(axis.ticks.length, 5);
  assert.ok(durationAxis([null]).top > 0);
  assert.ok(durationAxis([0]).top > 0);
});
