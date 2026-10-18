import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  progressTimeAxis,
  progressDayX,
  progressBarUnit,
  progressBarLabels,
  progressDateLabel,
} from '../src/lib/progress-chart';

test('eight-week charts share four fortnightly date labels and responsive calendar grids', () => {
  const start = '2026-08-24',
    end = '2026-10-12';
  const desktop = progressTimeAxis(start, end, 700, false);
  const phone = progressTimeAxis(start, end, 190, false);
  assert.deepEqual(desktop.labels, ['2026-08-24', '2026-09-07', '2026-09-21', '2026-10-05']);
  assert.deepEqual(phone.labels, desktop.labels);
  assert.equal(desktop.grids.length, 8);
  assert.equal(phone.grids.length, 4);
  assert.deepEqual(progressBarLabels(8, 'week', false), [0, 2, 4, 6]);
  assert.equal(progressDateLabel('2026-09-07', start, end), 'Sep 7');
});

test('line chart cadence uses days, weeks and aligned calendar months at increasing ranges', () => {
  assert.equal(progressTimeAxis('2026-10-12', '2026-10-18', 700, true).grids.length, 7);
  assert.deepEqual(progressTimeAxis('2026-10-12', '2026-10-18', 190, true).labels, [
    '2026-10-12',
    '2026-10-14',
    '2026-10-16',
    '2026-10-18',
  ]);
  assert.equal(progressTimeAxis('2026-10-01', '2026-10-31', 700, true).grids.length, 5);
  assert.equal(progressTimeAxis('2026-07-01', '2026-09-30', 700, true).grids.length, 7);
  assert.equal(progressTimeAxis('2026-01-01', '2026-06-30', 700, true).grids.length, 6);
  const year = progressTimeAxis('2026-01-01', '2026-12-31', 700, true);
  assert.deepEqual(year.labels, [
    '2026-01-01',
    '2026-03-01',
    '2026-05-01',
    '2026-07-01',
    '2026-09-01',
    '2026-11-01',
  ]);
  const all = progressTimeAxis('2024-10-18', '2026-10-18', 700, true);
  assert.ok(all.grids.length <= 8 && all.labels.length <= 6);
  assert.ok(
    all.grids.every(
      (day) => ['01', '04', '07', '10'].includes(day.slice(5, 7)) && day.endsWith('-01'),
    ),
  );
  assert.ok(
    all.labels.every((day) => ['01', '07'].includes(day.slice(5, 7)) && day.endsWith('-01')),
  );
});

test('calendar-day plot coordinates stay aligned across DST and inside the plot', () => {
  const xs = ['2026-03-07', '2026-03-08', '2026-03-09'].map((day) =>
    progressDayX(day, '2026-03-07', '2026-03-09'),
  );
  assert.ok(Math.abs(xs[1] - xs[0] - (xs[2] - xs[1])) < 1e-9);
  assert.ok(xs[0] > 0 && xs.at(-1)! < 100);
  assert.equal(progressDayX('2026-10-12', '2026-10-12', '2026-10-12'), 50);
});

test('both bar charts retain daily detail for a month and weekly detail through six months', () => {
  for (const period of ['1 week', '1 month'] as const)
    assert.equal(progressBarUnit(period, '2026-01-01', '2026-01-31'), 'day');
  for (const period of ['8 weeks', '3 months', '6 months'] as const)
    assert.equal(progressBarUnit(period, '2026-01-01', '2026-06-30'), 'week');
  assert.equal(progressBarUnit('1 year', '2026-01-01', '2026-12-31'), 'month');
  assert.equal(progressBarUnit('All time', '2026-10-01', '2026-10-12'), 'day');
  assert.equal(progressBarUnit('All time', '2026-08-01', '2026-10-12'), 'week');
  assert.equal(progressBarUnit('All time', '2024-01-01', '2026-10-12'), 'month');
  assert.deepEqual(progressBarLabels(31, 'day', true), [0, 7, 14, 21, 28]);
  assert.deepEqual(progressBarLabels(12, 'month', true), [0, 2, 4, 6, 8, 10]);
});
