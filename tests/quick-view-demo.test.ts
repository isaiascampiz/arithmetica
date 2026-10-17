import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { currentSets, incomingPackets } from '../src/lib/v3-planning';
import { isOpenVisit } from '../src/lib/model';
import { validateDatabase } from '../src/lib/repository';

test('separate Quick View fixture has real issued packet identities, varied modes and preparation without invented completion', () => {
  const db = quickViewDemo(new Date('2026-10-12T21:00:00Z'));
  validateDatabase(db);
  assert.match(db.operations!.center.name, /FICTIONAL/);
  assert.equal(db.students.length, 3);
  assert.equal(db.operations!.completions.length, 0);
  const [paper, mixed, single] = db.students;
  const sets = (id: string) =>
    currentSets(
      db,
      db.visits.find((v) => v.studentId === id && isOpenVisit(v))!,
    );
  assert.equal(sets(paper.id).length, 2);
  assert.ok(sets(paper.id).every((a) => a.v3!.preparedAt && !a.stale));
  assert.equal(sets(mixed.id).length, 1);
  assert.ok(sets(mixed.id).every((a) => !a.v3!.preparedAt));
  assert.equal(db.operations!.students[mixed.id].subjects.Reading.format, 'CONNECT');
  assert.deepEqual(single.subjects, ['Reading']);
  for (const student of db.students)
    for (const subject of student.subjects as ('Math' | 'Reading')[]) {
      if (db.operations!.students[student.id].subjects[subject].format === 'CONNECT') continue;
      const incoming = incomingPackets(db, student.id, subject);
      assert.equal(incoming.length, student.id === mixed.id ? 4 : 2);
      assert.ok(incoming.every((p) => p.status === 'issued'));
      assert.equal(new Set(incoming.map((p) => p.id)).size, incoming.length);
      assert.ok(
        incoming.every((p) =>
          db.operations!.assignments.some(
            (a) =>
              a.id === p.sourceAssignmentId && a.v3?.issued.some((issued) => issued.id === p.id),
          ),
        ),
      );
    }
});
