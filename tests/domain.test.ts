import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/lib/seed';
import { applyCommand, attendance, commandInput } from '../src/lib/domain';
import { dayKey, metrics, arrivalHistogram } from '../src/lib/model';
const owner = { name: 'Fictional Owner', role: 'owner' as const };
test('seed creates 96 unique fictional students and opaque codes', () => {
  const db = seed();
  assert.equal(db.students.length, 96);
  assert.equal(new Set(db.students.map((s) => s.token)).size, 96);
  assert.equal(new Set(db.students.map((s) => s.name)).size, 96);
  assert.equal(db.schemaVersion, 1);
});
test('duplicate arrivals and departures do not duplicate visits', () => {
  const db = seed();
  const id = db.students[50].id;
  assert.equal(attendance(db, id, 'in').changed, true);
  assert.equal(attendance(db, id, 'in').changed, false);
  assert.equal(db.visits.filter((v) => v.studentId === id && !v.departedAt).length, 1);
  assert.equal(attendance(db, id, 'out').changed, true);
  assert.equal(attendance(db, id, 'out').changed, false);
});
test('departure and next day leave the pending queue intact', () => {
  const db = seed();
  const id = db.students[0].id;
  applyCommand(
    db,
    {
      kind: 'observation',
      studentId: id,
      choices: ['Needed guidance'],
      text: 'Fictional test note',
      followUp: true,
    },
    owner,
  );
  const n = db.observations.at(-1)!;
  attendance(db, id, 'out');
  const nextDay = new Date(Date.now() + 86400000);
  assert.equal(n.reviewedAt, null);
  assert.ok(metrics(db, nextDay).pending >= 1);
});
test('review retains original content and author with reviewer attribution', () => {
  const db = seed();
  const note = db.observations[0];
  const text = note.text;
  applyCommand(db, { kind: 'review', id: note.id }, owner);
  assert.equal(note.text, text);
  assert.ok(note.reviewedAt);
  assert.equal(note.reviewedBy, owner.name);
  assert.equal(db.observations.length, 4);
});
test('assistant cannot create or review an observation', () => {
  const db = seed();
  const staff = { name: 'Demo Assistant', role: 'assistant' as const };
  assert.throws(
    () => applyCommand(db, { kind: 'review', id: db.observations[0].id }, staff),
    /instructor/,
  );
  assert.throws(
    () =>
      applyCommand(
        db,
        {
          kind: 'observation',
          studentId: db.students[0].id,
          choices: ['Strong focus'],
          text: '',
          followUp: false,
        },
        staff,
      ),
    /instructor/,
  );
});
test('homework moves forward without overwriting old packets', () => {
  const db = seed();
  const id = db.students[0].id;
  const original = db.homework.length;
  applyCommand(db, { kind: 'homework', studentId: id, description: 'Fictional 4A 1–10' }, owner);
  const packet = db.homework.at(-1)!;
  applyCommand(db, { kind: 'homework-status', id: packet.id, status: 'prepared' }, owner);
  applyCommand(db, { kind: 'homework-status', id: packet.id, status: 'handed-off' }, owner);
  assert.throws(
    () => applyCommand(db, { kind: 'homework-status', id: packet.id, status: 'assigned' }, owner),
    /backwards/,
  );
  assert.equal(db.homework.length, original + 1);
});
test('empty and oversized observations are rejected', () => {
  assert.equal(
    commandInput.safeParse({
      kind: 'observation',
      studentId: 'x',
      choices: [],
      text: '  ',
      followUp: false,
    }).success,
    false,
  );
  assert.equal(
    commandInput.safeParse({
      kind: 'observation',
      studentId: 'x',
      choices: [],
      text: 'x'.repeat(1201),
      followUp: false,
    }).success,
    false,
  );
});
test('unknown student cannot create attendance or notes', () => {
  const db = seed();
  assert.throws(() => attendance(db, 'missing', 'in'), /not found/);
  assert.throws(
    () =>
      applyCommand(
        db,
        {
          kind: 'observation',
          studentId: 'missing',
          choices: ['Strong focus'],
          text: '',
          followUp: false,
        },
        owner,
      ),
    /not found/,
  );
});
test('center timezone determines daily totals across UTC midnight', () => {
  assert.equal(dayKey('2026-10-13T01:00:00Z'), '2026-10-12');
  assert.equal(dayKey('2026-10-13T08:00:00Z'), '2026-10-13');
});
test('an old open visit remains in active occupancy', () => {
  const db = seed(new Date('2026-10-11T22:00:00Z'));
  const m = metrics(db, new Date('2026-10-12T22:00:00Z'));
  assert.equal(m.active, 12);
  assert.equal(m.today, 0);
});
test('arrival histogram includes all daily visits rather than assuming class hours', () => {
  const db = seed(new Date('2026-10-12T22:00:00Z'));
  assert.equal(
    arrivalHistogram(db.visits, 'America/Los_Angeles').reduce((n, b) => n + b.count, 0),
    42,
  );
});
