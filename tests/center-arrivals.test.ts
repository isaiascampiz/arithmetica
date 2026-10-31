import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { addFictionalCenterActivity } from './fixtures/center-activity-demo';
import { arrivalComparison, attendancePunches } from '../src/lib/center-arrivals';
import { activitySettings } from '../src/lib/activity-settings';
import { applyV3, v3CommandInput } from '../src/lib/v3-domain';
import { validateDatabase } from '../src/lib/repository';
import { preparationReturnDate } from '../src/lib/preparation-queue';
import { zonedTimestamp } from '../src/lib/schedule';
import type { Visit } from '../src/lib/model';

const now = new Date('2026-10-19T20:20:00Z');
function fixture() {
  const db = quickViewDemo(now);
  db.visits = [];
  return db;
}

test('arrival average uses prior matching weekdays, zero days and closures; excludes future punches and duplicate IDs', () => {
  const db = fixture(),
    tz = db.operations!.center.timezone;
  const visit = (id: string, date: string, time: string): Visit => ({
    id,
    studentId: db.students[0].id,
    arrivedAt: zonedTimestamp(date, time, tz),
    departedAt: null,
  });
  db.visits = [
    visit('a', '2026-09-28', '13:01'),
    visit('b', '2026-09-28', '13:02'),
    visit('closed', '2026-10-05', '13:02'),
    visit('zero-hour', '2026-10-12', '14:00'),
    visit('today', '2026-10-19', '13:05'),
    visit('future', '2026-10-19', '13:30'),
  ];
  db.visits.push(structuredClone(db.visits[0]));
  db.operations!.center.closedDates.push('2026-10-05');
  const before = JSON.stringify(db),
    result = arrivalComparison(db, '2026-10-19', 'Daily', now);
  const h13 = result.bins.find((b) => b.key === '13')!;
  assert.equal(h13.actual, 1);
  assert.equal(h13.expected, 1);
  assert.equal(h13.samples, 2);
  assert.equal(h13.partial, true);
  assert.equal(result.bins.find((b) => b.key === '14')!.actual, null);
  assert.equal(result.bins.find((b) => b.key === '14')!.expected, 0.5);
  assert.equal(result.total, 1);
  assert.equal(result.expectedTotal, 1.5);
  const weekly = arrivalComparison(db, '2026-10-21', 'Weekly', now);
  assert.equal(weekly.start, '2026-10-19');
  assert.equal(weekly.bins[0].actual, 1);
  assert.equal(weekly.bins[0].expected, 1.5);
  assert.equal(weekly.bins[1].actual, null);
  assert.equal(JSON.stringify(db), before);
});

test('hours preserve outside-hours arrivals, unavailable averages, center-local midnight and DST repeated hours', () => {
  const db = fixture();
  db.operations!.v3!.activityHours = activitySettings(db);
  db.operations!.v3!.activityHours.days.forEach((d) => {
    d.enabled = false;
  });
  db.visits = [
    {
      id: 'outside',
      studentId: db.students[0].id,
      arrivedAt: '2026-10-19T07:30:00Z',
      departedAt: null,
    },
  ];
  const result = arrivalComparison(db, '2026-10-19', 'Daily', now);
  assert.equal(result.bins.length, 1);
  assert.equal(result.bins[0].key, '0');
  assert.equal(result.bins[0].actual, 1);
  assert.equal(result.bins[0].expected, null);
  db.visits = ['2026-11-01T08:30:00Z', '2026-11-01T09:30:00Z'].map((arrivedAt, i) => ({
    id: String(i),
    studentId: db.students[0].id,
    arrivedAt,
    departedAt: null,
  }));
  const dst = arrivalComparison(db, '2026-11-01', 'Daily', new Date('2026-11-02T01:00:00Z'));
  assert.equal(dst.bins[0].key, '1');
  assert.equal(dst.bins[0].actual, 2);
  db.visits.push({
    id: 'prior-sunday',
    studentId: db.students[0].id,
    arrivedAt: '2026-10-25T08:30:00Z',
    departedAt: null,
  });
  const outsideAverage = arrivalComparison(
    db,
    '2026-11-01',
    'Daily',
    new Date('2026-11-02T01:00:00Z'),
  );
  assert.equal(outsideAverage.bins[0].expected, 1);
});

test('punch history keeps repeated visits and correction events; administrative closure never becomes check-out', () => {
  const db = fixture(),
    studentId = db.students[0].id;
  db.visits = [
    {
      id: 'one',
      studentId,
      arrivedAt: '2026-10-18T20:00:00Z',
      departedAt: '2026-10-18T21:00:00Z',
      departureVerified: true,
      events: [
        {
          at: '2026-10-19T19:00:00Z',
          kind: 'verified-correction',
          actor: 'Fictional Reviewer',
          reason: 'Confirmed time',
          value: '2026-10-18T21:00:00Z',
        },
      ],
    },
    {
      id: 'two',
      studentId,
      arrivedAt: '2026-10-18T22:00:00Z',
      departedAt: null,
      closedAt: '2026-10-19T02:00:00Z',
      departureVerified: false,
    },
    {
      id: 'reopen',
      studentId,
      arrivedAt: '2026-10-18T22:05:00Z',
      departedAt: null,
      events: [
        {
          at: '2026-10-18T23:00:00Z',
          kind: 'staff-departure',
          actor: 'Fictional Instructor',
        },
        {
          at: '2026-10-19T19:00:00Z',
          kind: 'reopened',
          actor: 'Fictional Reviewer',
          reason: 'Correcting punch',
        },
      ],
    },
  ];
  const rows = attendancePunches(db, now);
  assert.equal(rows.filter((p) => p.kind === 'Check-in').length, 3);
  assert.equal(rows.filter((p) => p.kind === 'Check-out').length, 1);
  assert.equal(rows.filter((p) => p.kind === 'Administrative closure').length, 1);
  assert.equal(rows.filter((p) => p.kind === 'Attendance change').length, 3);
  assert.equal(rows.find((p) => p.kind === 'Check-out')!.actor, 'Fictional Reviewer');
  assert.equal(rows.find((p) => p.kind === 'Check-out')!.reason, 'Confirmed time');
});

test('reporting hours require instructor authorization, reject stale versions and malformed persisted settings, and leave packet history intact', () => {
  const db = fixture(),
    before = JSON.stringify({
      students: db.operations!.students,
      assignments: db.operations!.assignments,
      visits: db.visits,
    });
  const saved = activitySettings(db);
  const command = v3CommandInput.parse({
    action: 'activity-hours',
    expectedVersion: 0,
    days: saved.days.map((d) => ({ ...d, start: d.day === 2 ? 10 : 13 })),
  });
  assert.throws(
    () => applyV3(db, command, { role: 'assistant', name: 'Fictional Assistant' }, now),
    /instructor/,
  );
  applyV3(db, command, { role: 'instructor', name: 'Fictional Instructor' }, now);
  assert.equal(activitySettings(db).version, 1);
  assert.equal(activitySettings(db).days.find((d) => d.day === 2)!.start, 10);
  assert.throws(
    () => applyV3(db, command, { role: 'owner', name: 'Fictional Owner' }, now),
    /hours changed/,
  );
  assert.equal(
    JSON.stringify({
      students: db.operations!.students,
      assignments: db.operations!.assignments,
      visits: db.visits,
    }),
    before,
  );
  validateDatabase(JSON.parse(JSON.stringify(db)));
  assert.equal(
    v3CommandInput.safeParse({
      ...command,
      days: [...saved.days.slice(1), saved.days[1]],
    }).success,
    false,
  );
  db.operations!.v3!.activityHours!.days[0].end = 1;
  assert.throws(() => validateDatabase(db), /Invalid activity hours/);
});

test('preparation queue uses the next scheduled return for older sets without rewriting their dates', () => {
  const db = fixture(),
    op = db.operations!,
    id = db.students[0].id;
  op.students[id].visitDays = [1, 4];
  assert.equal(preparationReturnDate(op, id, '2026-10-12', '2026-10-19'), '2026-10-19');
  assert.equal(preparationReturnDate(op, id, '2026-10-22', '2026-10-19'), '2026-10-22');
  op.center.closedDates.push('2026-10-19');
  assert.equal(preparationReturnDate(op, id, '2026-10-12', '2026-10-19'), '2026-10-22');
});

test('fictional chart samples are additive, idempotent, never future-dated and refuse unknown identities', () => {
  const db = quickViewDemo(now),
    before = structuredClone(db);
  assert.ok(addFictionalCenterActivity(db, now) > 0);
  assert.deepEqual(db.visits.slice(0, before.visits.length), before.visits);
  assert.deepEqual(db.observations, before.observations);
  assert.deepEqual(db.operations, before.operations);
  for (const v of db.visits.slice(before.visits.length))
    assert.ok(Date.parse(v.departedAt!) <= now.getTime());
  const revision = JSON.stringify(db);
  assert.equal(addFictionalCenterActivity(db, now), 0);
  assert.equal(JSON.stringify(db), revision);
  db.students[0].name = 'Unknown identity';
  assert.throws(() => addFictionalCenterActivity(db, now), /known fictional/);
});
