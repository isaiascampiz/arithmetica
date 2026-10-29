import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { addFictionalCenterActivity } from './fixtures/center-activity-demo';
import {
  centerAttendance,
  attendanceAxis,
  moveAttendanceDate,
  dailyTrafficBins,
} from '../src/lib/center-attendance';
import { homePreparation } from '../src/lib/home-preparation';
import { dayKey, isOpenVisit } from '../src/lib/model';

const now = new Date('2026-10-19T23:35:00Z');
test('unified attendance keeps averages only in daily/weekly views and reconciles chart and filtered punches', () => {
  const db = quickViewDemo(now);
  addFictionalCenterActivity(db, now);
  const before = JSON.stringify(db),
    date = dayKey(now, db.operations!.center.timezone);
  for (const period of ['Daily', 'Weekly', 'Monthly', 'Yearly'] as const) {
    const result = centerAttendance(db, date, period, '', now);
    assert.equal(result.total, result.rows.filter((p) => p.kind === 'Check-in').length);
    assert.equal(
      result.total,
      result.bins.reduce((n, b) => n + (b.actual || 0), 0),
    );
    assert.equal(result.compare, period === 'Daily' || period === 'Weekly');
    if (!result.compare) assert.ok(result.bins.every((b) => b.expected === null));
  }
  assert.equal(centerAttendance(db, date, 'Monthly', '', now).bins.length, 31);
  const student = db.students[0],
    filtered = centerAttendance(db, date, 'Monthly', student.name, now);
  assert.ok(filtered.rows.every((r) => r.studentId === student.id));
  assert.equal(
    filtered.total,
    db.visits.filter(
      (v) =>
        v.studentId === student.id &&
        dayKey(v.arrivedAt, db.operations!.center.timezone).startsWith('2026-10') &&
        Date.parse(v.arrivedAt) <= now.getTime(),
    ).length,
  );
  assert.equal(JSON.stringify(db), before);
});

test('attendance navigation uses calendar boundaries and integer zero-based axes fit actual and typical values', () => {
  assert.equal(moveAttendanceDate('2024-03-31', 'Monthly', -1), '2024-02-01');
  assert.equal(moveAttendanceDate('2026-12-31', 'Monthly', 1), '2027-01-01');
  assert.equal(moveAttendanceDate('2026-10-19', 'Weekly', -1), '2026-10-12');
  for (const value of [0, 0.25, 3, 9, 25, 100, 1097]) {
    const axis = attendanceAxis([
      { key: '0', label: '0', actual: value, expected: value + 0.5, samples: 1, partial: false },
    ]);
    assert.ok(axis.ceiling >= value + 0.5);
    assert.equal(axis.ticks.at(-1), 0);
    assert.equal(axis.ticks.length, 5);
    assert.ok(axis.ticks.every(Number.isInteger));
  }
});

test('Home readiness distinguishes unprepared, partly ready, prepared, issued and CONNECT without changing packet state', () => {
  const db = quickViewDemo(now),
    student = db.students[0],
    today = dayKey(now, db.operations!.center.timezone);
  const visit = db.visits.find((v) => v.studentId === student.id && isOpenVisit(v))!;
  const sets = db.operations!.assignments.filter(
    (a) => a.studentId === student.id && a.v3 && !a.v3.issuedAt,
  );
  assert.equal(homePreparation(db, student.id, today, visit)?.state, 'ready');
  sets[0].v3!.preparedAt = null;
  assert.equal(homePreparation(db, student.id, today, visit)?.state, 'partial');
  sets.forEach((a) => {
    a.v3!.preparedAt = null;
  });
  assert.equal(homePreparation(db, student.id, today, visit)?.state, 'needed');
  sets.forEach((a) => {
    a.v3!.preparedAt = now.toISOString();
    a.stale = false;
    a.v3!.visitId = visit.id;
    a.v3!.issuedAt = now.toISOString();
  });
  assert.equal(homePreparation(db, student.id, today, visit)?.state, 'issued');
  db.operations!.students[student.id].subjects.Math.format = 'CONNECT';
  db.operations!.students[student.id].subjects.Reading.format = 'CONNECT';
  assert.equal(homePreparation(db, student.id, today, visit)?.state, 'issued');
  sets.forEach((a) => {
    a.v3!.issuedAt = null;
  });
  sets[0].v3!.temporaryPaper = true;
  assert.equal(homePreparation(db, student.id, today, visit)?.state, 'ready');
  sets[0].v3!.temporaryPaper = false;
  const before = JSON.stringify(db);
  assert.equal(homePreparation(db, student.id, today, visit)?.state, 'none');
  assert.equal(JSON.stringify(db), before);
});

test('fixed noon-to-seven plot preserves full-day data and never mutates hourly records', () => {
  const db = quickViewDemo(now);
  addFictionalCenterActivity(db, now);
  const result = centerAttendance(db, '2026-10-19', 'Daily', '', now),
    saved = JSON.stringify(result.bins),
    plot = dailyTrafficBins(result.bins);
  assert.equal(result.bins.length, 24);
  assert.deepEqual(
    plot.map((b) => Number(b.key)),
    [12, 13, 14, 15, 16, 17, 18, 19],
  );
  assert.deepEqual(
    plot.map((b) => b.label),
    ['12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM'],
  );
  assert.equal(JSON.stringify(result.bins), saved);
  assert.equal(result.total, result.rows.filter((p) => p.kind === 'Check-in').length);
});
