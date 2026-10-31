import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { completeStudentName } from '../src/lib/name-completion';
test('inline completion exposes one active name only and waits through shared first names', () => {
  const db = quickViewDemo(),
    [a, b, c] = db.students;
  a.name = 'Alex Rivera';
  b.name = 'Alex Brooks';
  c.name = 'Alexandra Stone';
  const before = JSON.stringify(db);
  assert.deepEqual(completeStudentName(db, 'Al'), { completion: null });
  assert.deepEqual(completeStudentName(db, 'Alex'), { completion: null });
  assert.deepEqual(completeStudentName(db, 'Alex R'), {
    completion: 'Alex Rivera',
  });
  assert.deepEqual(completeStudentName(db, ' ALEX   B'), {
    completion: 'Alex Brooks',
  });
  assert.deepEqual(completeStudentName(db, 'Alexan'), {
    completion: 'Alexandra Stone',
  });
  assert.deepEqual(completeStudentName(db, 'No match'), { completion: null });
  assert.equal(JSON.stringify(db), before);
  b.name = a.name;
  assert.deepEqual(completeStudentName(db, 'Alex R'), { completion: null });
  db.operations!.students[b.id].active = false;
  assert.deepEqual(completeStudentName(db, 'Alex R'), { completion: a.name });
  db.operations!.students[a.id].active = false;
  assert.deepEqual(completeStudentName(db, 'Alex R'), { completion: null });
});

test('punctuation and digits do not satisfy the three-letter kiosk threshold', () => {
  const db = quickViewDemo();
  db.students[0].name = "O'Briar Stone";
  assert.deepEqual(completeStudentName(db, "O'B"), { completion: null });
  assert.deepEqual(completeStudentName(db, "O'Br"), { completion: "O'Briar Stone" });
  db.students[0].name = 'O1Briar Stone';
  assert.deepEqual(completeStudentName(db, 'O1B'), { completion: null });
  assert.deepEqual(completeStudentName(db, 'O1Br'), { completion: 'O1Briar Stone' });

  db.students[0].name = '\u00c9lise Long';
  assert.deepEqual(completeStudentName(db, '\u00c9l'), { completion: null });
  assert.deepEqual(completeStudentName(db, '\u00c9li'), { completion: '\u00c9lise Long' });
});
