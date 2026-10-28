import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { centerActivity } from '../src/lib/v3-analytics';
import type { Visit } from '../src/lib/model';

test('occupancy clips long crossing visits to selected weekday gaps, deduplicates IDs and keeps live/unverified counts', () => {
  const db = quickViewDemo(new Date('2026-10-08T19:30:00Z'));
  const visit = (id: string, arrivedAt: string, departedAt: string | null): Visit => ({
    id,
    studentId: db.students[0].id,
    arrivedAt,
    departedAt,
  });
  db.visits = [
    visit('crossing', '2026-09-30T23:00:00Z', '2026-10-02T10:00:00Z'),
    visit('duplicate', '2026-10-01T18:00:00Z', '2026-10-01T19:00:00Z'),
    visit('duplicate', '2026-10-01T20:30:00Z', '2026-10-01T22:00:00Z'),
    visit('current', '2026-10-08T19:00:00Z', null),
    visit('old-open', '2026-10-01T17:00:00Z', null),
    {
      ...visit('unverified', '2026-10-01T18:00:00Z', null),
      closedAt: '2026-10-02T02:00:00Z',
      departureVerified: false,
    },
    visit('after', '2026-10-09T20:00:00Z', '2026-10-09T21:00:00Z'),
    visit('before', '2026-09-01T20:00:00Z', '2026-09-01T21:00:00Z'),
  ];
  const before = JSON.stringify(db);
  const result = centerActivity(
    db,
    '2026-10-01',
    '2026-10-08',
    4,
    new Date('2026-10-08T19:30:00Z'),
  );
  assert.equal(result.days, 2);
  assert.equal(result.visits, 4);
  assert.equal(result.excluded, 2);
  assert.equal(result.live, 1);
  for (const bin of result.bins)
    assert.equal(
      bin.occupancy,
      0.5 + (bin.hour === 12 ? 0.25 : bin.hour === 13 ? 0.25 : bin.hour === 14 ? 0.5 : 0),
    );
  assert.equal(result.bins[13].arrivals, 1);
  assert.equal(result.bins[11].arrivals, 1);
  assert.equal(JSON.stringify(db), before);
});
