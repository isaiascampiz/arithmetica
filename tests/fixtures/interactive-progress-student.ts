import { randomUUID } from 'node:crypto';
import type { Database } from '../../src/lib/model';
import { dayKey } from '../../src/lib/model';
import type { Subject } from '../../src/lib/v2-model';
import { addDays, weekday, zonedTimestamp } from '../../src/lib/schedule';

export const progressStudentId = 'fictional-progress-rowan-v1';
/** Explicit, additive simulation. Never edits an existing student or turns receipt assumptions into verification. */
export function addInteractiveProgressStudent(db: Database, now = new Date()) {
  if (db.students.some((s) => s.id === progressStudentId)) return false;
  const op = db.operations!;
  if (db.schemaVersion !== 3 || !op.v3 || !db.students.length)
    throw Error('A populated V3 fictional center is required.');
  const template = db.students[0],
    settings = structuredClone(op.students[template.id]);
  const today = dayKey(now, op.center.timezone),
    first = addDays(today, -729);
  db.students.push({
    ...structuredClone(template),
    id: progressStudentId,
    token: randomUUID(),
    name: 'Fictional Rowan Progress Demo',
    initials: 'RP',
    earlyLearner: false,
    subjects: ['Math', 'Reading'],
    level: 'D',
  });
  settings.active = true;
  settings.familyId = null;
  settings.enrollmentDate = first;
  settings.grade = 'Grade 4';
  settings.version = 1;
  settings.visitDays = settings.recurringDays = [1, 4];
  settings.awayUntil = null;
  settings.updatedAt = now.toISOString();
  op.students[progressStudentId] = settings;
  const paths: Record<Subject, string[]> = {
    Math: ['4A', '3A', '2A', 'A', 'B', 'C', 'B', 'C', 'D', 'C', 'D'],
    Reading: ['4A', '3A', '4A', '3A', '2A', '3A', '2A'],
  };
  for (const subject of ['Math', 'Reading'] as Subject[]) {
    const path = paths[subject],
      stageDays = Math.ceil(730 / path.length);
    const assignmentTemplate = op.assignments.find((a) => a.subject === subject);
    if (!assignmentTemplate) throw Error('Fictional assignment template missing for ' + subject);
    const config = settings.subjects[subject];
    Object.assign(config, {
      enrolled: true,
      format: 'Paper',
      level: path.at(-1),
      currentStart: 196,
      currentEnd: 200,
      nextStart: 196,
      packetsPerDay: 1,
      sheetsPerPacket: 5,
    });
    for (const [stage, level] of path.entries()) {
      const previous = path[Math.max(0, stage - 1)];
      const date = addDays(first, stage * stageDays);
      const at = new Date(zonedTimestamp(date, '09:00', op.center.timezone)).toISOString();
      const order = (id: string) =>
        op.v3!.catalog.find((l) => l.subject === subject && l.id === id)!.order;
      const repeat = stage > 0 && order(level) < order(previous);
      const prior = structuredClone(settings);
      prior.subjects[subject].level = previous;
      op.configHistory.push({
        studentId: progressStudentId,
        at: new Date(Date.parse(at) - 60000).toISOString(),
        subjects: prior.subjects,
        settings: prior,
      });
      op.decisions.push({
        id: `${progressStudentId}-${subject}-decision-${stage}`,
        studentId: progressStudentId,
        subject,
        kind: repeat ? 'repeat-from' : 'advance',
        range: { level, start: 1, end: 5 },
        note: repeat
          ? `Fictional simulation: return from ${previous} to ${level} to build ${subject === 'Math' ? 'calculation fluency' : 'reading confidence'}. Start again at pages 1–5 and rebuild the homework sequence.`
          : 'Fictional simulation: recorded the next level.',
        author: 'Fictional Demo Instructor',
        approvedBy: 'Fictional Demo Instructor',
        createdAt: at,
        approvedAt: at,
      });
    }
    for (let day = 0; day < 730; day++) {
      const date = addDays(first, day);
      if (day % 13 === 6) continue; // No completion record or dot for this day.
      const level = path[Math.min(path.length - 1, Math.floor(day / stageDays))];
      const start = 1 + Math.min(39, Math.floor(((day % stageDays) * 40) / stageDays)) * 5;
      const at = new Date(zonedTimestamp(date, '16:00', op.center.timezone)).toISOString();
      const id = `${progressStudentId}-${subject}-${date}`;
      const assignment = structuredClone(assignmentTemplate);
      delete assignment.v3;
      Object.assign(assignment, {
        id,
        studentId: progressStudentId,
        subject,
        fromDate: date,
        nextVisit: null,
        homeworkDays: [date],
        ranges: [{ level, start, end: start + 4 }],
        carryIds: [],
        carryRanges: [],
        status: 'verified',
        createdAt: at,
        updatedAt: at,
        fingerprint: id,
        targetPackets: 1,
        targetSheets: 5,
        newPackets: 1,
        newSheets: 5,
        blocked: [],
        stale: false,
        events: [
          {
            at,
            actor: 'Fictional Demo Instructor',
            status: 'verified',
            reason: 'Entirely fictional simulation, not a real verification.',
          },
        ],
      });
      op.assignments.push(assignment);
      op.completions.push({
        id: id + '-completion',
        assignmentId: id,
        studentId: progressStudentId,
        subject,
        level,
        worksheets: Array.from({ length: 5 }, (_, i) => start + i),
        physicalSheets: 5,
        officialCount: null,
        format: 'Paper',
        completedDate: date,
        at,
        active: true,
        verifiedBy: 'Fictional Demo Instructor',
        reason: 'Entirely fictional daily packet history, not a real student or real verification.',
      });
    }
  }
  for (let day = 0; day < 729; day++) {
    const date = addDays(first, day);
    if (![1, 4].includes(weekday(date))) continue;
    const at = new Date(zonedTimestamp(date, '15:00', op.center.timezone)).toISOString();
    const id = progressStudentId + '-visit-' + date;
    db.visits.push({
      id,
      studentId: progressStudentId,
      arrivedAt: at,
      departedAt: new Date(Date.parse(at) + (35 + (day % 4) * 5) * 60000).toISOString(),
      departureVerified: true,
    });
    if (day % 7 === 1)
      db.observations.push({
        id: id + '-observation',
        studentId: progressStudentId,
        visitId: id,
        choices: [],
        text: 'Fictional example: steady focus and growing independence.',
        followUp: false,
        createdAt: at,
        author: 'Fictional Demo Instructor',
        reviewedAt: null,
        reviewedBy: null,
        skillRatings: [
          { id: 'focus', label: 'Focus', score: 3 + (day % 3) },
          { id: 'handwriting', label: 'Handwriting', score: 4 },
          { id: 'independence', label: 'Independence', score: 3 + (day % 3) },
        ],
      });
  }
  db.audit.push({
    id: progressStudentId + '-import',
    at: now.toISOString(),
    actor: 'Fictional demo setup',
    action: 'Added explicitly fictional two-year progress simulation',
    entityId: progressStudentId,
  });
  return true;
}
