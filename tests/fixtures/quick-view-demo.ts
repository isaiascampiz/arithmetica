import { seed } from '../../src/lib/seed';
import { migrateV3 } from '../../src/lib/v3-migrate';
import { attendance } from '../../src/lib/domain';
import { applyV3 } from '../../src/lib/v3-domain';
import { currentSets, synchronizePreparation } from '../../src/lib/v3-planning';
import { dayKey } from '../../src/lib/model';
import { addDays, weekday, zonedTimestamp } from '../../src/lib/schedule';
import type { Staff } from '../../src/lib/model';

/** A NEW fictional aggregate only. Never merge it into an existing center's records. */
export function quickViewDemo(now = new Date()) {
  const db = seed(now);
  db.students = db.students.slice(0, 3);
  db.visits = [];
  db.observations = [];
  db.homework = [];
  migrateV3(db, now);
  const op = db.operations!,
    teacher: Staff = { role: 'instructor', name: 'Fictional Demo Instructor' };
  op.center.name = 'FICTIONAL Quick View demo';
  op.center.autoClose = false;
  const today = dayKey(now, op.center.timezone),
    priorDate = addDays(today, -((weekday(today) + 6) % 7) - 7),
    priorAt = new Date(zonedTimestamp(priorDate, '14:00', op.center.timezone));
  for (const [index, student] of db.students.entries()) {
    student.name = ['Fictional Avery Demo', 'Fictional Milo Demo', 'Fictional Isla Demo'][index];
    student.initials = ['AD', 'MD', 'ID'][index];
    student.subjects = index === 2 ? ['Reading'] : ['Math', 'Reading'];
    student.earlyLearner = index === 0;
    for (const subject of student.subjects as ('Math' | 'Reading')[]) {
      if (index === 0)
        op.achievements.push({
          id: 'fictional-demo-prior-medal-' + subject,
          studentId: student.id,
          subject,
          distinction: 'Bronze',
          date: addDays(priorDate, -120),
          evidence: '',
          verifiedBy: teacher.name,
          createdAt: priorAt.toISOString(),
        });
      op.achievements.push({
        id: 'fictional-demo-medal-' + index + '-' + subject,
        studentId: student.id,
        subject,
        distinction:
          index === 0
            ? subject === 'Math'
              ? 'Gold'
              : 'Silver'
            : index === 1
              ? 'Bronze'
              : 'Platinum',
        date: priorDate,
        evidence: '',
        verifiedBy: teacher.name,
        createdAt: priorAt.toISOString(),
      });
    }
    const cfg = op.students[student.id];
    cfg.grade = ['Grade 1', 'Grade 4', 'Kindergarten'][index];
    cfg.visitDays = [1, 4];
    cfg.goals = '';
    cfg.awayUntil = null;
    for (const subject of ['Math', 'Reading'] as const) {
      cfg.subjects[subject] = {
        ...cfg.subjects[subject],
        enrolled: student.subjects.includes(subject),
        format: index === 1 && subject === 'Reading' ? 'CONNECT' : 'Paper',
        level: subject === 'Math' ? 'D' : '4A',
        currentStart: 1,
        currentEnd: 5,
        nextStart: 11,
        sheetsPerPacket: index === 2 ? 3 : 5,
        packetsPerDay: index === 1 ? 2 : 1,
      };
    }
    attendance(db, student.id, 'in', priorAt, teacher.name);
    const previous = db.visits.at(-1)!;
    synchronizePreparation(db, priorDate);
    const sets = currentSets(db, previous);
    for (const a of sets) {
      a.createdAt = priorAt.toISOString();
      applyV3(
        db,
        {
          action: 'prepare',
          ids: [a.id],
          versions: { [a.id]: a.v3!.version },
          reprepare: false,
        },
        teacher,
        priorAt,
      );
    }
    applyV3(
      db,
      {
        action: 'handoff',
        visitId: previous.id,
        expectedAt: null,
        subjects: currentSets(db, previous).map((a) => ({
          subject: a.subject,
          assignmentId: a.id,
          version: a.v3!.version,
          activity: 'Worksheets',
          exception: false,
          incoming: [],
          actual: null,
          repeat: null,
          physicalConfirmed: false,
          reason: '',
        })),
        choices: [],
        text: '',
        followUp: false,
        correctionReason: '',
      },
      teacher,
      priorAt,
    );
    attendance(db, student.id, 'out', new Date(priorAt.getTime() + 45 * 60000), teacher.name);
    const arrival = new Date(now.getTime() - (24 + index * 5) * 60000);
    attendance(db, student.id, 'in', arrival, teacher.name);
    synchronizePreparation(db, dayKey(arrival, op.center.timezone));
    if (index === 0)
      for (const a of currentSets(db, db.visits.at(-1)!))
        applyV3(
          db,
          {
            action: 'prepare',
            ids: [a.id],
            versions: { [a.id]: a.v3!.version },
            reprepare: false,
          },
          teacher,
          arrival,
        );
  }
  return db;
}
