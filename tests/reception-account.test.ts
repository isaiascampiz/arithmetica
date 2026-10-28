import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { quickViewDemo } from './fixtures/quick-view-demo';
import { closeDueVisits, runDueJobs } from '../src/lib/reports';
import { receptionEntry } from '../src/lib/kiosk-attendance';
import { saveStaffProfile, staffProfile } from '../src/lib/staff-profile';
import { validateDatabase } from '../src/lib/repository';
import { measuredMinutes } from '../src/lib/v3-analytics';
import type { Staff } from '../src/lib/model';

const now = new Date('2026-10-20T03:00:00Z'); // Monday, 8 PM in Yuba City.
const staff: Staff = { role: 'instructor', name: 'Fictional instructor', id: 'test-instructor' };
test('reception retries retain their receipt after the scan debounce window without toggling attendance', () => {
  const db = quickViewDemo(now);
  db.visits = [];
  db.audit = [];
  const input = { name: db.students[0].name, requestId: randomUUID() };
  const first = receptionEntry(db, input, now);
  assert.equal(first.direction, 'in');
  assert.equal(first.studentName, db.students[0].name);
  assert.deepEqual(receptionEntry(db, input, new Date(now.getTime() + 60000)), first);
  assert.equal(db.visits.length, 1);
  assert.equal(db.visits[0].departedAt, null);
  assert.throws(
    () => receptionEntry(db, { ...input, name: db.students[1].name }, now),
    /Request ID/,
  );
  validateDatabase(JSON.parse(JSON.stringify(db)));
});
test('damaged reception receipts fail closed', () => {
  const db = quickViewDemo(now);
  db.operations!.v3!.receptionReceipts = {
    [randomUUID()]: { fingerprint: 'invalid', result: { message: '', changed: true } },
  };
  assert.throws(() => validateDatabase(db));
});
test('V3 closes missed checkouts once without inventing departure time or blocking the next visit', () => {
  const db = quickViewDemo(now);
  db.visits = [];
  db.audit = [];
  const student = db.students[0];
  db.operations!.center.autoClose = false;
  db.visits.push({
    id: 'missed-checkout',
    studentId: student.id,
    arrivedAt: '2026-10-19T21:00:00Z',
    departedAt: null,
  });
  const plans = structuredClone(db.operations!.assignments);
  assert.equal(closeDueVisits(db, now), 1);
  const visit = db.visits[0];
  assert.equal(visit.departedAt, null);
  assert.equal(visit.departureVerified, false);
  assert.equal(measuredMinutes(visit), null);
  assert.equal(closeDueVisits(db, now), 0);
  assert.equal(db.audit.length, 1);
  assert.deepEqual(db.operations!.assignments, plans);
  const result = receptionEntry(
    db,
    { name: student.name.toUpperCase().replace(' ', '  ') },
    new Date('2026-10-20T21:00:00Z'),
  );
  assert.equal(result.direction, 'in');
  assert.equal(db.visits.length, 2);
  assert.deepEqual(Object.keys(result).sort(), ['changed', 'direction', 'message', 'studentName']);
});
test('name entry never guesses among duplicate or inactive names and preserves duplicate-scan protection', () => {
  const db = quickViewDemo(now);
  db.visits = [];
  db.audit = [];
  const student = db.students[0];
  assert.equal(receptionEntry(db, { name: student.name }, now).changed, true);
  assert.equal(receptionEntry(db, { name: student.name }, now).changed, false);
  db.students[1].name = student.name;
  assert.throws(() => receptionEntry(db, { name: student.name }, now), /couldn’t confirm/);
  db.operations!.students[student.id].active = false;
  db.operations!.students[db.students[1].id].active = false;
  assert.throws(() => receptionEntry(db, { name: student.name }, now), /couldn’t confirm/);
  assert.throws(
    () => receptionEntry(db, { name: 'No such fictional student' }, now),
    /couldn’t confirm/,
  );
});
test('V3 reports use closing time while legacy scheduling behavior is retained', () => {
  const db = quickViewDemo(now);
  db.operations!.center.jobStartDate = '2026-10-19';
  db.operations!.center.reportTime = '23:59';
  db.operations!.center.closingTime = '19:15';
  db.operations!.reports = [];
  runDueJobs(db, now);
  assert.ok(db.operations!.reports.some((r) => r.jobKey === 'daily:2026-10-19'));
  const count = db.operations!.reports.length;
  runDueJobs(db, now);
  assert.equal(db.operations!.reports.length, count);
});
test('account updates are self-scoped, stale-safe and idempotent without renaming historical attribution', () => {
  const db = quickViewDemo(now),
    notes = structuredClone(db.observations),
    students = structuredClone(db.students);
  const input = {
    expectedVersion: 0,
    firstName: 'Test',
    lastName: 'Instructor',
    picture: '',
    requestId: randomUUID(),
  };
  const saved = saveStaffProfile(db, staff, input);
  assert.equal(saved.version, 1);
  assert.equal(db.audit.at(-1)!.actor, staff.name);
  assert.deepEqual(saveStaffProfile(db, staff, input), saved);
  assert.throws(
    () => saveStaffProfile(db, staff, { ...input, firstName: 'Changed' }),
    /Request ID/,
  );
  assert.throws(
    () => saveStaffProfile(db, staff, { ...input, requestId: randomUUID() }),
    /changed elsewhere/,
  );
  assert.equal(staffProfile(db, { ...staff, id: 'another-person' }).version, 0);
  assert.deepEqual(db.observations, notes);
  assert.deepEqual(db.students, students);
  validateDatabase(JSON.parse(JSON.stringify(db)));
});
test('malformed account metadata and unsupported picture uploads fail closed', () => {
  const db = quickViewDemo(now);
  const input = {
    expectedVersion: 0,
    firstName: 'Test',
    lastName: '',
    picture: 'data:image/svg+xml;base64,PHN2Zy8+',
    requestId: randomUUID(),
  };
  assert.throws(() => saveStaffProfile(db, staff, input), /PNG/);
  db.operations!.v3!.staffProfiles = {
    invalid: { version: -1, firstName: 'Test', lastName: '', picture: '' },
  };
  assert.throws(() => validateDatabase(db));
});
