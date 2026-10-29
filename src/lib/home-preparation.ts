import type { Database, Visit } from './model';
import { currentSets } from './v3-planning';
import { centerFeatures } from './center-features';
import { subjectNeedsSetup } from './student-setup';

/** Preparation is a physical state; issued work stays distinct from an unissued ready set. */
export function homePreparation(db: Database, studentId: string, today: string, visit?: Visit) {
  if (!centerFeatures(db).homework) return null;
  const cfg = db.operations!.students[studentId];
  const sets = visit
    ? currentSets(db, visit)
    : db.operations!.assignments.filter(
        (a) => a.studentId === studentId && a.v3?.visitDate === today && !a.v3.issuedAt,
      );
  const subjects = (['Math', 'Reading'] as const).filter(
    (s) =>
      (cfg.subjects[s].enrolled &&
        !subjectNeedsSetup(cfg.subjects[s]) &&
        cfg.subjects[s].format === 'Paper') ||
      sets.some((a) => a.subject === s && (a.v3?.temporaryPaper || a.v3?.issuedAt)),
  );
  if (!subjects.length)
    return {
      state: 'none',
      label: cfg.setupPending ? 'Homework setup needed' : 'No paper homework',
    };
  const applicable = subjects.map((subject) => sets.filter((a) => a.subject === subject).at(-1));
  if (applicable.every((a) => a?.v3?.issuedAt))
    return { state: 'issued', label: 'Homework issued' };
  const ready = applicable.filter(
    (a) => a?.v3 && (a.v3.issuedAt || (a.v3.preparedAt && !a.stale && !a.v3.review.length)),
  ).length;
  if (ready === subjects.length) return { state: 'ready', label: 'Homework prepared' };
  if (ready) return { state: 'partial', label: 'Homework partly prepared' };
  return { state: 'needed', label: 'Homework needs preparation' };
}
