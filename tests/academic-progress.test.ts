import { test } from 'node:test';
import assert from 'node:assert/strict';
import { academicHistory, academicPlot } from '../src/lib/academic-progress';
import { academicProgressDemo } from './fixtures/academic-progress-demo';

const now = new Date('2026-10-12T21:00:00Z');
test('academic history keeps subjects and evidence sources distinct and retains repeat notes', () => {
  const db = academicProgressDemo(now),
    student = db.students[0],
    before = JSON.stringify(db);
  const math = academicHistory(db, student.id, 'Math'),
    reading = academicHistory(db, student.id, 'Reading');
  const repeats = math.filter((e) => e.kind === 'repeat');
  assert.deepEqual(
    repeats.map((e) => [e.fromLevel, e.level]),
    [
      ['C', 'B'],
      ['D', 'C'],
    ],
  );
  assert.ok(
    repeats.every(
      (e) => e.note.includes('Fictional example') && e.actor === 'Fictional Demo Instructor',
    ),
  );
  assert.ok(
    reading
      .filter((e) => e.kind === 'repeat')
      .every((e) => e.fromLevel === '4A' && e.level === '5A'),
  );
  assert.ok(math.some((e) => e.kind === 'completion'));
  assert.ok(
    math.filter((e) => e.kind === 'completion').every((e) => e.evidence === 'routine receipt'),
  );
  assert.equal(db.operations!.completions.filter((c) => c.studentId === student.id).length, 0);
  const plot = academicPlot(db, 'Math', math);
  assert.ok(plot.points.every((p) => p.events.length === 1 && p.events[0].kind === 'completion'));
  assert.ok(plot.points.some((p, i) => i > 0 && p.position < plot.points[i - 1].position));
  assert.ok(plot.points.every((p) => p.position > p.rank && p.position <= p.rank + 1));
  assert.equal(JSON.stringify(db), before);
});
test('unknown levels stay in history and absent previous-level evidence is not reconstructed', () => {
  const db = academicProgressDemo(now),
    student = db.students[0];
  db.operations!.configHistory = [];
  const history = academicHistory(db, student.id, 'Math');
  assert.ok(history.filter((e) => e.kind === 'repeat').every((e) => e.fromLevel === null));
  const unknown = {
    ...history.find((e) => e.kind === 'completion')!,
    id: 'unknown',
    level: 'Uncatalogued',
  };
  const plot = academicPlot(db, 'Math', [...history, unknown]);
  assert.equal(plot.unknown[0].level, 'Uncatalogued');
  assert.equal(
    plot.points.some((p) => p.level === 'Uncatalogued'),
    false,
  );
  assert.deepEqual(academicPlot(db, 'Math', []).levels, []);
});

test('long fictional demo has two years of linked incoming, in-center and outgoing visit snapshots', () => {
  const db = academicProgressDemo(now),
    student = db.students[0];
  const visits = db.visits.filter(
    (v) => v.studentId === student.id && v.id.startsWith('fictional-academic-visit-'),
  );
  assert.equal(visits.length, 104);
  assert.ok(Date.parse(now.toISOString()) - Date.parse(visits[0].arrivedAt) > 700 * 86400000);
  assert.ok(visits.every((v) => v.departureVerified && v.sessionRecords?.length === 2));
  const [first, second] = visits;
  assert.equal(
    second.sessionRecords![0].incoming[0].packet.id,
    first.sessionRecords![0].outgoing[0].id,
  );
  assert.ok(second.sessionRecords![0].center);
  assert.ok(
    visits.every((v) =>
      v.sessionRecords!.every((r) =>
        r.outgoing.every((p) =>
          db.operations!.assignments.some((a) => a.id === p.sourceAssignmentId),
        ),
      ),
    ),
  );
  assert.ok(academicHistory(db, student.id, 'Math').some((e) => e.kind === 'completion'));
});

test('only received completed packets create bubbles, one per packet, never issuance or missing work', () => {
  const db = academicProgressDemo(now),
    student = db.students[0];
  const visit = db.visits.find(
    (v) =>
      v.studentId === student.id &&
      v.sessionRecords?.some((r) => r.subject === 'Math' && r.incoming.length),
  )!;
  const record = visit.sessionRecords!.find((r) => r.subject === 'Math')!;
  db.visits = [visit];
  record.incoming[0].outcome = 'finished';
  record.incoming[1].outcome = 'unfinished';
  record.incoming[2].outcome = 'missing';
  const before = JSON.stringify(db);
  const history = academicHistory(db, student.id, 'Math');
  const points = academicPlot(db, 'Math', history).points;
  assert.equal(points.length, 1);
  assert.equal(points[0].at, record.at);
  assert.equal(points[0].events[0].start, record.incoming[0].packet.range.start);
  assert.equal(points[0].events[0].evidence, 'explicit receipt');
  assert.equal(JSON.stringify(db), before);
  record.incoming[0].outcome = 'unfinished';
  assert.equal(academicPlot(db, 'Math', academicHistory(db, student.id, 'Math')).points.length, 0);
});

test('reviewing an already received physical packet does not duplicate its bubble', () => {
  const db = academicProgressDemo(now),
    student = db.students[0];
  const initial = academicPlot(db, 'Math', academicHistory(db, student.id, 'Math')).points.length;
  const record = db.visits
    .find(
      (v) =>
        v.studentId === student.id &&
        v.sessionRecords?.some((r) => r.subject === 'Math' && r.incoming.length),
    )!
    .sessionRecords!.find((r) => r.subject === 'Math')!;
  const copy = structuredClone(record);
  copy.at = now.toISOString();
  db.visits.push({
    ...structuredClone(db.visits[0]),
    id: 'duplicate-review',
    studentId: student.id,
    sessionRecords: [copy],
  });
  assert.equal(
    academicPlot(db, 'Math', academicHistory(db, student.id, 'Math')).points.length,
    initial,
  );
});

test('calendar navigation preserves whole weeks, month lengths, leap days and years', async () => {
  const { academicWindow } = await import('../src/lib/academic-progress');
  assert.deepEqual(academicWindow('1 week', 0, '2026-10-14', '2024-01-01'), {
    start: '2026-10-12',
    end: '2026-10-18',
  });
  assert.deepEqual(academicWindow('1 week', -1, '2026-10-14', '2024-01-01'), {
    start: '2026-10-05',
    end: '2026-10-11',
  });
  assert.deepEqual(academicWindow('1 month', -1, '2024-03-31', '2024-01-01'), {
    start: '2024-02-01',
    end: '2024-02-29',
  });
  assert.deepEqual(academicWindow('1 year', -1, '2026-10-14', '2024-01-01'), {
    start: '2025-01-01',
    end: '2025-12-31',
  });
});

test('checkpoints are daily in a week and monthly in a year; source history stays intact', async () => {
  const { academicCheckpoints } = await import('../src/lib/academic-progress');
  const db = academicProgressDemo(now),
    student = db.students[0];
  const points = academicPlot(db, 'Math', academicHistory(db, student.id, 'Math')).points;
  const before = JSON.stringify(points);
  const sampled = academicCheckpoints(points, '1 year', db.operations!.center.timezone);
  assert.ok(sampled.daily.length < points.length);
  assert.ok(sampled.checkpoints.length <= 25);
  assert.equal(new Set(sampled.daily.map((p) => p.at.slice(0, 10))).size, sampled.daily.length);
  const week = points.filter((p) => p.at >= '2026-09-21' && p.at < '2026-09-28');
  assert.ok(
    academicCheckpoints(week, '1 week', db.operations!.center.timezone).checkpoints.length <= 7,
  );
  assert.equal(JSON.stringify(points), before);
});

test('trend checkpoints select fourteen actual dates including both endpoints without hidden line vertices', async () => {
  const { academicCheckpoints } = await import('../src/lib/academic-progress');
  const { addDays } = await import('../src/lib/schedule');
  const points = Array.from({ length: 365 }, (_, i) => ({
    id: String(i),
    at: addDays('2025-01-01', i) + 'T20:00:00Z',
  }));
  for (const period of ['1 month', '3 months', '6 months', 'All time'] as const) {
    const result = academicCheckpoints(points, period, 'America/Los_Angeles');
    assert.equal(result.checkpoints.length, 14);
    assert.equal(result.checkpoints[0].id, '0');
    assert.equal(result.checkpoints.at(-1)!.id, '364');
    assert.ok(result.checkpoints.every((point) => points.includes(point)));
    const indices = result.checkpoints.map((p) => Number(p.id));
    const steps = indices.slice(1).map((n, i) => n - indices[i]);
    assert.ok(Math.max(...steps) - Math.min(...steps) <= 1);
  }
  const sparse = points.filter((_, i) => i === 0 || i === 200 || i === 364);
  assert.deepEqual(
    academicCheckpoints(sparse, '3 months', 'America/Los_Angeles').checkpoints,
    sparse,
  );
});

test('calendar date labels follow a consistent month or day stride without isolated forced endpoints', async () => {
  const { academicDateTicks } = await import('../src/lib/academic-progress');
  assert.deepEqual(
    academicDateTicks('2026-01-01', '2026-12-31', 12),
    Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`),
  );
  assert.deepEqual(academicDateTicks('2026-01-01', '2026-12-31', 6), [
    '2026-01-01',
    '2026-03-01',
    '2026-05-01',
    '2026-07-01',
    '2026-09-01',
    '2026-11-01',
  ]);
  assert.deepEqual(academicDateTicks('2026-10-01', '2026-10-31', 6), [
    '2026-10-01',
    '2026-10-08',
    '2026-10-15',
    '2026-10-22',
    '2026-10-29',
  ]);
  assert.deepEqual(academicDateTicks('2026-10-12', '2026-10-18', 3), [
    '2026-10-12',
    '2026-10-15',
    '2026-10-18',
  ]);
});

test('Y domain fits a small weekly change instead of reserving a full 200-page level', async () => {
  const { academicYDomain } = await import('../src/lib/academic-progress');
  const values = [10.775, 10.8, 10.825, 10.85, 10.875];
  const domain = academicYDomain(values, 10, 11);
  assert.ok(domain.bottom <= Math.min(...values) && domain.top >= Math.max(...values));
  assert.ok(domain.top - domain.bottom <= 0.2);
  assert.ok((Math.max(...values) - Math.min(...values)) / (domain.top - domain.bottom) >= 0.5);
  assert.ok(domain.ticks.length >= 5);
  assert.ok(domain.ticks.every((tick) => tick >= 10 && tick <= 11));
});

test('Y domains remain finite for flat records and stay within the recorded levels', async () => {
  const { academicYDomain } = await import('../src/lib/academic-progress');
  for (const values of [[10.9], [11, 11], [10.005, 10.01], [2.025, 10.975]]) {
    const low = Math.min(10, Math.floor(Math.min(...values)));
    const domain = academicYDomain(values, low, 11);
    assert.ok(domain.top > domain.bottom);
    assert.ok(domain.bottom <= Math.min(...values) && domain.top >= Math.max(...values));
    assert.ok(domain.bottom >= low && domain.top <= 11);
    assert.ok(domain.ticks.length >= 3 && domain.ticks.length <= 13);
  }
});
