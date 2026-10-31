import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/lib/seed';
import { migrateV3 } from '../src/lib/v3-migrate';
import { attendance } from '../src/lib/domain';
import { applyV3, v3CommandInput, type V3Command } from '../src/lib/v3-domain';
import {
  currentSets,
  homeRoster,
  synchronizePreparation,
  validateRange,
} from '../src/lib/v3-planning';
import { buildReport } from '../src/lib/reports';
import { measuredMinutes } from '../src/lib/v3-analytics';
import { addDays, zonedTimestamp } from '../src/lib/schedule';
import { reportWorksheets } from '../src/lib/report-view';

test('96 fictional paper/CONNECT visit cycles keep attendance, preparation, handoff and evidence distinct', () => {
  const now = new Date('2026-10-05T20:00:00Z');
  const db = seed(now);
  migrateV3(db, now);
  // This fixture is entirely in memory; no records repository is opened.
  db.visits = [];
  db.observations = [];
  const actor = {
    name: 'Fictional Release Instructor',
    role: 'instructor' as const,
  };
  const students = db.students.slice(0, 24);
  for (const [index, student] of students.entries()) {
    const config = db.operations!.students[student.id];
    config.visitDays = [1, 3];
    config.subjects.Math = {
      ...config.subjects.Math,
      enrolled: true,
      format: index % 3 === 0 ? 'CONNECT' : 'Paper',
      level: 'D',
      nextStart: 1,
      sheetsPerPacket: 5,
      packetsPerDay: 1,
    };
    config.subjects.Reading.enrolled = false;
  }
  const act = (command: V3Command, at: Date) =>
    applyV3(db, v3CommandInput.parse(command), actor, at);
  for (const offset of [0, 2, 7, 9]) {
    const day = addDays('2026-10-05', offset),
      at = new Date(zonedTimestamp(day, '13:00', db.operations!.center.timezone));
    synchronizePreparation(db, day);
    for (const student of students) {
      const before = db.visits.length;
      attendance(db, student.id, 'in', at, actor.name);
      const visit = db.visits.at(-1)!;
      assert.equal(db.visits.length, before + 1);
      assert.equal(visit.handoff, undefined);
      const sets = currentSets(db, visit);
      if (db.operations!.students[student.id].subjects.Math.format === 'CONNECT') {
        assert.equal(sets.length, 0, 'CONNECT has no ordinary paper preparation');
      }
      for (const assignment of sets) {
        for (const packet of [assignment.v3!.inCenter, ...assignment.v3!.planned])
          if (packet) assert.equal(validateRange(db, assignment.subject, packet.range), null);
        act(
          {
            action: 'prepare',
            ids: [assignment.id],
            versions: { [assignment.id]: assignment.v3!.version },
            reprepare: false,
          },
          at,
        );
        assert.equal(visit.handoff, undefined, 'preparation never confirms instructor handoff');
        assert.equal(assignment.v3!.issuedAt, null);
      }
      act(
        {
          action: 'handoff',
          visitId: visit.id,
          expectedAt: null,
          subjects: sets.map((assignment) => ({
            subject: assignment.subject,
            assignmentId: assignment.id,
            version: assignment.v3!.version,
            activity: 'Worksheets',
            exception: false,
            incoming: [],
            actual: null,
            repeat: null,
            physicalConfirmed: false,
            reason: '',
          })),
          choices: [],
          text: 'Fictional release simulation.',
          followUp: false,
          correctionReason: '',
        },
        at,
      );
      assert.equal(db.visits.find((record) => record.id === visit.id)!.handoff?.actor, actor.name);
      assert.equal(visit.departedAt, null, 'handoff does not check the student out');
      attendance(db, student.id, 'out', new Date(at.getTime() + 45 * 60000), actor.name);
      assert.equal(measuredMinutes(visit), 45);
    }
    const prepared = db.operations!.assignments.length;
    synchronizePreparation(db, day);
    assert.equal(db.operations!.assignments.length, prepared, 'synchronization is repeatable');
  }
  assert.equal(db.visits.length, 96);
  assert.equal(new Set(db.visits.map((visit) => visit.id)).size, 96);
  const beforeRead = structuredClone(db);
  const report = buildReport(db, 'monthly', '2026-10', new Date('2026-10-31T23:00:00Z'));
  assert.equal(report.visits, 96);
  assert.equal(
    reportWorksheets(report.detail!).reduce((sum, row) => sum + row.worksheets, 0),
    0,
  );
  homeRoster(db, '2026-10-14');
  assert.deepEqual(db, beforeRead, 'reports and roster projections never mutate saved evidence');
});
