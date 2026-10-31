import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { emptyProductionCenter } from '../src/lib/center-initialization';
import {
  applyRosterImport,
  assertRosterDestination,
  prepareRosterImport,
} from '../src/lib/roster/import';
import { validateDatabase } from '../src/lib/repository';
import { applyV3, v3CommandInput } from '../src/lib/v3-domain';
import { applyV2 } from '../src/lib/v2-domain';
import { paperProposal, synchronizePreparation } from '../src/lib/v3-planning';
import { attendance } from '../src/lib/domain';
import { expectedOn } from '../src/lib/schedule';
import { runDueJobs } from '../src/lib/reports';
import type { Staff } from '../src/lib/model';
import { filterRoster } from '../src/lib/v3-analytics';
import { directoryFilters } from '../src/lib/student-directory';

const now = new Date('2026-10-28T20:00:00Z');
const owner: Staff = { name: 'Fictional Owner', role: 'owner' };
test('a pending profile without subjects remains visible until a specific subject or format filter is selected', () => {
  const { db } = imported();
  const student = db.students[0];
  student.subjects = [];
  db.operations!.students[student.id].subjects.Math.enrolled = false;
  db.operations!.students[student.id].subjects.Reading.enrolled = false;
  assert.equal(filterRoster(db, directoryFilters).length, 1);
  assert.equal(filterRoster(db, { ...directoryFilters, query: student.name }).length, 1);
  assert.equal(filterRoster(db, { ...directoryFilters, medal: 'None' }).length, 1);
  assert.equal(filterRoster(db, { ...directoryFilters, subject: 'Math' }).length, 0);
  assert.equal(filterRoster(db, { ...directoryFilters, format: 'Paper' }).length, 0);
});
function empty() {
  return emptyProductionCenter(
    {
      name: 'Fictional isolated import center',
      timezone: 'America/Los_Angeles',
      operatingDays: [1, 2, 3, 4],
      closingTime: '19:15',
      expectedMinutes: 45,
      earlyPerInstructor: 2,
    },
    owner.name,
    now,
  );
}
export function fictionalRoster() {
  return {
    format: 'arithmetica-pending-roster',
    version: 1,
    batchRequestId: randomUUID(),
    sourceSha256: 'a'.repeat(64),
    sourceSheet: 'Fictional source',
    reviewedAsOf: '2026-10-28',
    productionImportReady: false,
    policy: {
      excludedSubjects: ['EFL'],
      excludedColumns: ['ASHR', 'ST1', 'ST2'],
      identityMatch: 'normalized-first-last-and-exact-dob',
      birthDateExported: false,
    },
    profiles: [
      {
        intakeId: randomUUID(),
        firstName: 'Fictional',
        lastName: 'Import Student',
        grade: 'K',
        enrollmentDate: '2026-10-01',
        sourceRows: [2, 3],
        visitDays: null,
        setupState: 'pending',
        subjects: (['Math', 'Reading'] as const).map((subject) => ({
          subject,
          level: subject === 'Math' ? '4A' : 'BII',
          enrollmentDate: '2026-10-01',
          modality: null,
          worksheetPosition: null,
          dailyWorksheets: null,
          setupState: 'pending',
        })),
      },
    ],
    excludedSubjectRows: [],
    unresolvedEnrollmentDateRows: [],
  };
}
function imported() {
  const db = empty();
  const prepared = prepareRosterImport({ expectedRevision: 0, roster: fictionalRoster() }, now);
  applyRosterImport(db, prepared, owner);
  return {
    db,
    prepared,
    student: db.students[0],
    settings: db.operations!.students[db.students[0].id],
  };
}
test('a production baseline has no fictional students, staff, policies or histories copied from the demo', () => {
  const db = empty();
  validateDatabase(db);
  assert.equal(db.students.length, 0);
  assert.deepEqual(db.operations!.v3!.catalog, []);
  assert.equal(runDueJobs(db, new Date('2026-11-01T04:00:00Z')), 0);
  assert.equal(db.operations!.reports.length, 0);
});

test('real source packages are refused on staging and unknown deployment environments', () => {
  const prepared = prepareRosterImport({
    expectedRevision: 0,
    roster: fictionalRoster(),
  });
  assert.doesNotThrow(() => assertRosterDestination(prepared.roster, 'staging'));
  prepared.roster.sourceSheet = 'Sheet1';
  assert.throws(() => assertRosterDestination(prepared.roster, 'staging'), /production workspace/);
  assert.throws(() => assertRosterDestination(prepared.roster, undefined), /production workspace/);
  assert.doesNotThrow(() => assertRosterDestination(prepared.roster, 'production'));
});

test('structured name edits remain consistent and corrupt ready positions fail closed', () => {
  const { db, student, settings } = imported();
  const before = JSON.stringify(db);
  const command = {
    action: 'student-save',
    studentId: student.id,
    name: 'Fictional Renamed Student',
    firstName: 'Fictional Renamed',
    lastName: 'Student',
    earlyLearner: false,
    settings: structuredClone(settings),
    enrollmentDate: settings.enrollmentDate || null,
    visitDays: [],
    tiles: [],
    goals: '',
    arrivalWindow: '',
  };
  assert.throws(
    () => applyV3(db, v3CommandInput.parse({ ...command, name: 'Mismatched name' }), owner, now),
    /must match/,
  );
  assert.equal(JSON.stringify(db), before);
  applyV3(db, v3CommandInput.parse(command), owner, now);
  assert.equal(student.name, `${student.firstName} ${student.lastName}`);
  const math = db.operations!.students[student.id].subjects.Math;
  math.format = 'Paper';
  math.setupPending = false;
  assert.throws(() => validateDatabase(db), /incomplete setup/);
});
test('owner import is atomic and exactly retryable with stable IDs, tokens, dates and no invented work', () => {
  const { db, prepared, student, settings } = imported();
  validateDatabase(db);
  assert.equal(student.id, prepared.roster.profiles[0].intakeId);
  assert.equal(settings.enrollmentDate, '2026-10-01');
  assert.equal(settings.intake!.subjectEnrollmentDates.Reading, '2026-10-01');
  assert.deepEqual(settings.visitDays, []);
  assert.equal(settings.subjects.Math.format, 'Unspecified');
  assert.equal(settings.subjects.Math.currentStart, 0);
  assert.equal(settings.setupPending, true);
  const saved = JSON.stringify(db);
  const retry = prepareRosterImport(
    { expectedRevision: 0, roster: prepared.roster },
    new Date('2026-10-29T20:00:00Z'),
  );
  assert.deepEqual(applyRosterImport(db, retry, owner), {
    imported: 1,
    duplicate: true,
  });
  assert.equal(JSON.stringify(db), saved);
  assert.equal(
    db.observations.length +
      db.visits.length +
      db.homework.length +
      db.operations!.assignments.length +
      db.operations!.completions.length,
    0,
  );
  synchronizePreparation(db, '2026-10-28');
  assert.equal(db.operations!.assignments.length, 0);
  assert.equal(expectedOn(db.operations!, student.id, '2026-10-28'), false);
});
test('imports reject nonowners, stale revisions, occupied centers, duplicate source rows and conflicting retries without writes', () => {
  const db = empty();
  const roster = fictionalRoster();
  const prepared = prepareRosterImport({ expectedRevision: 0, roster }, now);
  const before = JSON.stringify(db);
  assert.throws(
    () =>
      applyRosterImport(db, prepared, {
        name: 'Fictional Assistant',
        role: 'assistant',
      }),
    /Only the owner/,
  );
  db.revision = 1;
  assert.throws(() => applyRosterImport(db, prepared, owner), /changed/);
  db.revision = 0;
  assert.equal(JSON.stringify(db), before);
  const invalid = structuredClone(roster);
  invalid.profiles.push({ ...invalid.profiles[0], intakeId: randomUUID() });
  assert.throws(() => prepareRosterImport({ expectedRevision: 0, roster: invalid }), /Duplicate/);
  applyRosterImport(db, prepared, owner);
  const saved = JSON.stringify(db);
  const changed = structuredClone(roster);
  changed.profiles[0].firstName = 'Fictional Changed';
  assert.throws(
    () =>
      applyRosterImport(db, prepareRosterImport({ expectedRevision: 0, roster: changed }), owner),
    /different data/,
  );
  const again = { ...roster, batchRequestId: randomUUID() };
  assert.throws(
    () => applyRosterImport(db, prepareRosterImport({ expectedRevision: 0, roster: again }), owner),
    /already imported/,
  );
  again.sourceSha256 = 'b'.repeat(64);
  assert.throws(
    () => applyRosterImport(db, prepareRosterImport({ expectedRevision: 0, roster: again }), owner),
    /empty production center/,
  );
  assert.equal(JSON.stringify(db), saved);
});
test('incomplete subjects allow attendance and observations while forged homework handoffs and legacy writes are blocked', () => {
  const { db, student, settings } = imported();
  const visitId = attendance(db, student.id, 'in', now, owner.name);
  const visit = db.visits.find((item) => item.studentId === student.id)!;
  assert.ok(visitId);
  assert.equal(paperProposal(db, student.id, 'Math', '2026-10-28', 'fictional-plan'), null);
  applyV3(
    db,
    {
      action: 'observation',
      visitId: visit.id,
      choices: [],
      text: 'Fictional note',
      followUp: false,
    },
    owner,
    now,
  );
  assert.equal(db.observations[0].text, 'Fictional note');
  applyV3(
    db,
    {
      action: 'activity-check-in',
      visitId: visit.id,
      subject: 'Math',
      activity: 'Worksheets',
      expectedAt: null,
      expectedFeaturesVersion: 0,
      text: '',
      correctionReason: '',
    },
    owner,
    now,
  );
  assert.equal(visit.sessionRecords?.at(-1)?.mode, 'activity-only');
  assert.equal(visit.sessionRecords?.at(-1)?.format, 'Unspecified');
  assert.equal(settings.subjects.Math.currentStart, 0);
  assert.equal(db.operations!.assignments.length, 0);
  assert.throws(
    () =>
      applyV3(
        db,
        {
          action: 'handoff',
          visitId: visit.id,
          subject: 'Math',
          activity: 'Worksheets',
          expectedAt: null,
          subjects: [],
          choices: [],
          text: '',
          followUp: false,
          correctionReason: '',
        },
        owner,
        now,
      ),
    /Complete subject setup/,
  );
  const before = JSON.stringify(db);
  assert.throws(
    () =>
      applyV2(
        db,
        {
          action: 'student-save',
          studentId: student.id,
          name: student.name,
          earlyLearner: false,
          settings,
        },
        owner,
        now,
      ),
    /current profile editor/,
  );
  assert.equal(JSON.stringify(db), before);
});
test('teachers can save partial profile edits and enable one confirmed paper subject without enabling the other', () => {
  const { db, student, settings } = imported();
  const command = () => ({
    action: 'student-save',
    studentId: student.id,
    name: student.name,
    earlyLearner: false,
    settings: structuredClone(db.operations!.students[student.id]),
    enrollmentDate: settings.enrollmentDate || null,
    visitDays: [] as number[],
    tiles: [],
    goals: '',
    arrivalWindow: '',
  });
  const partial = command();
  partial.settings.grade = '1';
  applyV3(db, v3CommandInput.parse(partial), owner, now);
  assert.equal(db.operations!.students[student.id].grade, '1');
  assert.equal(db.operations!.students[student.id].intake!.sourceSha256, 'a'.repeat(64));
  const ready = command();
  ready.visitDays = [1, 3];
  Object.assign(ready.settings.subjects.Math, {
    setupPending: false,
    format: 'Paper',
    currentStart: 21,
    currentEnd: 21,
    nextStart: 21,
    packetsPerDay: 1,
    classworkSheets: 10,
  });
  assert.throws(
    () => applyV3(db, v3CommandInput.parse(ready), owner, now),
    /approved worksheet boundary/,
  );
  db.operations!.v3!.catalog.push({
    subject: 'Math',
    id: '4A',
    order: 0,
    first: 1,
    last: 200,
    approved: true,
    source: 'Fictional instructor verified boundary',
  });
  applyV3(db, v3CommandInput.parse(ready), owner, now);
  assert.equal(db.operations!.students[student.id].subjects.Math.setupPending, false);
  assert.equal(db.operations!.students[student.id].subjects.Reading.setupPending, true);
  assert.equal(paperProposal(db, student.id, 'Reading', '2026-10-28', 'fictional-reading'), null);
  assert.ok(paperProposal(db, student.id, 'Math', '2026-10-28', 'fictional-math'));
  assert.throws(() => applyV3(db, v3CommandInput.parse(ready), owner, now), /profile changed/);
});
