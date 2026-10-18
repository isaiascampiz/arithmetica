import type { Database } from '../../src/lib/model';
import { dayKey } from '../../src/lib/model';
import { addDays } from '../../src/lib/schedule';
import { progressStudentId } from './interactive-progress-student';
export const skillDemoMarker = 'fictional-rowan-skill-ratings-v1';
export const skillTransitionMarker = 'fictional-rowan-skill-transitions-v1';
/** Explicit additive simulation; never edits existing observations, visits or student settings. */
export function addFictionalSkillRatings(db: Database, now = new Date()) {
  if (db.audit.some((a) => a.id === skillDemoMarker)) return addFictionalSkillTransitions(db, now);
  if (
    !db.operations!.center.name.startsWith('FICTIONAL') ||
    db.students.find((s) => s.id === progressStudentId)?.name !== 'Fictional Rowan Progress Demo'
  )
    throw Error('The explicitly fictional Rowan center is required.');
  const today = dayKey(now, db.operations!.center.timezone);
  const visits = db.visits
    .filter(
      (v) =>
        v.studentId === progressStudentId &&
        v.departedAt &&
        v.departureVerified === true &&
        !db.observations.some((o) => o.visitId === v.id) &&
        dayKey(v.arrivedAt, db.operations!.center.timezone) < today,
    )
    .toSorted((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
  let count = 0;
  for (const [i, v] of visits.entries()) {
    if (i % 2 || Math.floor(i / 2) % 11 === 3 || db.observations.some((o) => o.visitId === v.id))
      continue;
    const progress = i / Math.max(1, visits.length - 1),
      wave = [0, 1, 0, -1, 0, 1, 0][Math.floor(i / 2) % 7];
    const skillRatings = [
      {
        id: 'focus',
        label: 'Focus',
        score: Math.max(1, Math.min(5, 2 + Math.floor(progress * 2) + wave)),
      },
      {
        id: 'handwriting',
        label: 'Handwriting',
        score: Math.max(1, Math.min(5, 2 + Math.floor(progress * 3) + (i % 6 === 0 ? -1 : 0))),
      },
    ];
    if (progress > 0.3)
      skillRatings.push({
        id: 'independence',
        label: 'Independence',
        score: Math.max(1, Math.min(5, 2 + Math.floor(progress * 2) + (i % 8 === 0 ? 1 : 0))),
      });
    if (progress < 0.45)
      skillRatings.push({
        id: 'fictional-organization',
        label: 'Organization',
        score: 2 + (i % 3),
      });
    const id = skillDemoMarker + ':' + v.id;
    if (db.observations.some((o) => o.id === id)) continue;
    db.observations.push({
      id,
      studentId: progressStudentId,
      visitId: v.id,
      createdAt: new Date(Date.parse(v.arrivedAt) + 120000).toISOString(),
      author: 'Fictional Demo Instructor',
      text: 'Entirely fictional skill-rating simulation for the progress preview.',
      choices: [],
      followUp: false,
      reviewedAt: null,
      reviewedBy: null,
      skillRatings,
    });
    count++;
  }
  db.audit.push({
    id: skillDemoMarker,
    at: now.toISOString(),
    actor: 'Fictional demo setup',
    action: 'Added explicitly fictional skill-rating examples to Rowan history',
    entityId: progressStudentId,
  });
  return count + addFictionalSkillTransitions(db, now);
}

/** Recent switch scenario supplements the original fixture without changing any saved evidence. */
export function addFictionalSkillTransitions(db: Database, now = new Date()) {
  if (db.audit.some((a) => a.id === skillTransitionMarker)) return 0;
  if (
    !db.operations!.center.name.startsWith('FICTIONAL') ||
    db.students.find((s) => s.id === progressStudentId)?.name !== 'Fictional Rowan Progress Demo'
  )
    throw Error('The explicitly fictional Rowan center is required.');
  const today = dayKey(now, db.operations!.center.timezone),
    start = addDays(today, -84),
    switchDay = addDays(today, -42);
  const visits = db.visits
    .filter(
      (v) =>
        v.studentId === progressStudentId &&
        v.departedAt &&
        v.departureVerified === true &&
        dayKey(v.arrivedAt, db.operations!.center.timezone) >= start &&
        dayKey(v.arrivedAt, db.operations!.center.timezone) < today,
    )
    .toSorted((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
  let count = 0;
  for (const [i, v] of visits.entries()) {
    if (i % 2 || i % 7 === 4) continue;
    const day = dayKey(v.arrivedAt, db.operations!.center.timezone),
      old = day < switchDay;
    const id = skillTransitionMarker + ':' + v.id;
    if (db.observations.some((o) => o.id === id)) continue;
    db.observations.push({
      id,
      studentId: progressStudentId,
      visitId: v.id,
      createdAt: new Date(Date.parse(v.arrivedAt) + 120000).toISOString(),
      author: 'Fictional Demo Instructor',
      text: 'Entirely fictional skill-switch example: Preparation ends and Confidence begins later. Original records remain unchanged.',
      choices: [],
      followUp: false,
      reviewedAt: null,
      reviewedBy: null,
      skillRatings: [
        {
          id: old ? 'fictional-preparation' : 'fictional-confidence',
          label: old ? 'Preparation' : 'Confidence',
          score: old ? 2 + (i % 3) : 3 + (i % 3),
        },
      ],
    });
    count++;
  }
  db.audit.push({
    id: skillTransitionMarker,
    at: now.toISOString(),
    actor: 'Fictional demo setup',
    action: 'Added explicitly fictional skill-switch examples to Rowan history',
    entityId: progressStudentId,
  });
  return count;
}
