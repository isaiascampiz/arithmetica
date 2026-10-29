import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accents, isAccent } from '../src/lib/appearance';
import { buildReport, reportBounds } from '../src/lib/reports';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { addFictionalCenterActivity } from './fixtures/center-activity-demo';
function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((c) => parseInt(c, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
test('accent palettes retain readable contrast in each theme and reject arbitrary preference values', () => {
  for (const a of accents)
    for (const [fg, bg] of [
      [a.light, '#fcfcfb'],
      [a.dark, '#202020'],
    ]) {
      const l1 = luminance(fg),
        l2 = luminance(bg);
      assert.ok(
        (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) >= 4.5,
        a.label + ' contrast',
      );
    }
  assert.ok(isAccent('violet'));
  assert.equal(isAccent('url(unsafe)'), false);
  assert.equal(isAccent(null), false);
});
test('read-only yearly report sums visits over calendar boundaries without changing archives or evidence', () => {
  const now = new Date('2026-10-19T23:35:00Z'),
    db = quickViewDemo(now);
  addFictionalCenterActivity(db, now);
  const saved = JSON.stringify(db);
  assert.deepEqual(reportBounds('yearly', '2024-02-29'), {
    start: '2024-01-01',
    end: '2024-12-31',
  });
  const yearly = buildReport(db, 'yearly', '2026', now),
    monthly = Array.from({ length: 12 }, (_, i) =>
      buildReport(db, 'monthly', '2026-' + String(i + 1).padStart(2, '0'), now),
    );
  assert.equal(
    yearly.visits,
    monthly.reduce((n, r) => n + r.visits, 0),
  );
  assert.equal(
    yearly.physicalSheets,
    monthly.reduce((n, r) => n + r.physicalSheets, 0),
  );
  assert.equal(yearly.detail!.end, '2026-12-31');
  assert.equal(JSON.stringify(db), saved);
});
