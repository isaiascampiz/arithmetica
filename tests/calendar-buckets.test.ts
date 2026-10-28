import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarBuckets } from '../src/lib/calendar-buckets';

test('calendar buckets clip leap-month and week edges while preserving unsorted source order and empty days', () => {
  const records = [
    { id: 'march', day: '2024-03-01' },
    { id: 'second', day: '2024-02-29' },
    { id: 'outside', day: '2024-02-26' },
    { id: 'first', day: '2024-02-29' },
    { id: 'after', day: '2024-03-03' },
  ];
  const before = JSON.stringify(records);
  const days = calendarBuckets(records, '2024-02-27', '2024-03-02', 'day');
  assert.deepEqual(
    days.map((b) => [b.start, b.records.map((r) => r.id)]),
    [
      ['2024-02-27', []],
      ['2024-02-28', []],
      ['2024-02-29', ['second', 'first']],
      ['2024-03-01', ['march']],
      ['2024-03-02', []],
    ],
  );
  assert.deepEqual(
    calendarBuckets(records, '2024-02-27', '2024-03-02', 'month').map((b) => [
      b.start,
      b.end,
      b.records.map((r) => r.id),
    ]),
    [
      ['2024-02-27', '2024-02-29', ['second', 'first']],
      ['2024-03-01', '2024-03-02', ['march']],
    ],
  );
  assert.deepEqual(
    calendarBuckets(records, '2024-02-27', '2024-03-05', 'week').map((b) => [
      b.start,
      b.end,
      b.records.map((r) => r.id),
    ]),
    [
      ['2024-02-27', '2024-03-03', ['march', 'second', 'first', 'after']],
      ['2024-03-04', '2024-03-05', []],
    ],
  );
  assert.equal(JSON.stringify(records), before);
});

test('calendar buckets preserve bounded traversal and exclude records beyond the displayed window', () => {
  assert.deepEqual(calendarBuckets([], '2026-10-20', '2026-10-01', 'day'), []);
  const buckets = calendarBuckets([{ day: '2099-01-01' }], '2000-01-01', '2099-12-31', 'day');
  assert.equal(buckets.length, 3700);
  assert.ok(buckets.every((b) => !b.records.length));
});
