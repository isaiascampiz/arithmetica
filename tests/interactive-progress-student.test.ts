import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import {
  addInteractiveProgressStudent,
  progressStudentId,
} from './fixtures/interactive-progress-student';
import { academicHistory, academicPlot, academicCheckpoints } from '../src/lib/academic-progress';
import { validateDatabase } from '../src/lib/repository';

test('interactive fictional addition preserves the whole existing center and is idempotent', () => {
  const now = new Date('2026-10-12T21:00:00Z'),
    db = quickViewDemo(now),
    before = structuredClone(db);
  assert.equal(addInteractiveProgressStudent(db, now), true);
  validateDatabase(db);
  for (const key of ['students', 'visits', 'observations', 'homework', 'audit'] as const)
    assert.deepEqual(db[key].slice(0, before[key].length), before[key]);
  for (const [key, value] of Object.entries(before.operations!)) {
    const actual = db.operations![key as keyof typeof db.operations];
    if (Array.isArray(value)) assert.deepEqual((actual as unknown[]).slice(0, value.length), value);
    else if (key === 'students')
      for (const [id, settings] of Object.entries(value))
        assert.deepEqual(db.operations!.students[id], settings);
    else assert.deepEqual(actual, value);
  }
  for (const subject of ['Math', 'Reading'] as const) {
    const history = academicHistory(db, progressStudentId, subject);
    const completions = history.filter((e) => e.kind === 'completion');
    assert.ok(completions.length > 650);
    assert.equal(new Set(completions.map((e) => e.at.slice(0, 10))).size, completions.length);
    assert.ok(history.filter((e) => e.kind === 'repeat').length >= 2);
    assert.ok(
      history
        .filter((e) => e.kind === 'repeat')
        .every((e) => e.note.includes('Fictional simulation')),
    );
    const plot = academicPlot(db, subject, history);
    const months = academicCheckpoints(plot.points, '1 year', db.operations!.center.timezone);
    assert.ok(months.checkpoints.length <= 25);
    assert.ok(plot.points.some((p, i) => i > 0 && p.position < plot.points[i - 1].position));
  }
  const added = JSON.stringify(db);
  assert.equal(addInteractiveProgressStudent(db, now), false);
  assert.equal(JSON.stringify(db), added);
});
