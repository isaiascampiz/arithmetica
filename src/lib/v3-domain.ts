import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from './domain';
import { dayKey, isOpenVisit, type Database, type Staff } from './model';
import { dateInput, studentSettingsInput } from './v2-domain';
import { weekday } from './schedule';
import { migrateV3 } from './v3-migrate';
import {
  currentSets,
  incomingPackets,
  paperProposal,
  recommend,
  subjectPlan,
  reuseSequence,
  repeatSequence,
  synchronizePreparation,
  validateRange,
} from './v3-planning';
import type { Packet } from './v3-model';
import type { Subject } from './v2-model';
const subject = z.enum(['Math', 'Reading']);
const range = z.object({
  level: z.string().trim().min(1).max(20),
  start: z.number().int().min(1).max(10000),
  end: z.number().int().min(1).max(10000),
});
const packet = z.object({
  id: z.string().max(150),
  range,
  sourceAssignmentId: z.string(),
  purpose: z.enum(['in-center', 'homework']),
  prepared: z.boolean(),
  status: z.enum(['planned', 'issued', 'held', 'finished', 'unfinished', 'missing', 'routine']),
});
const tiles = z.array(z.string().trim().min(1).max(48)).max(6);
const skill = z.object({ id: z.string().min(1).max(100), label: z.string().trim().min(1).max(48) });
const observations = {
  skillRatings: z
    .array(skill.extend({ score: z.number().int().min(1).max(5) }))
    .max(12)
    .optional(),
  skillSettings: z.object({ version: z.number().int(), skills: z.array(skill).max(12) }).optional(),
};
export const v3CommandInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('observation-edit'),
    id: z.string(),
    expectedVersion: z.number().int().min(0),
    text: z.string().trim().max(1200),
    skillRatings: observations.skillRatings,
  }),
  z.object({
    action: z.literal('prepare'),
    ids: z.array(z.string()).min(1).max(2),
    versions: z.record(z.string(), z.number().int()),
    reprepare: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('student-save'),
    studentId: z.string(),
    name: z.string().trim().min(2).max(120),
    earlyLearner: z.boolean(),
    settings: studentSettingsInput,
    enrollmentDate: dateInput.nullable(),
    awayUntil: dateInput.nullable().optional(),
    visitDays: z.array(z.number().int().min(1).max(4)).min(1).max(4),
    tiles,
    goals: z.string().trim().max(400),
    arrivalWindow: z.string().max(40).default(''),
  }),
  z.object({ action: z.literal('away'), studentId: z.string(), until: dateInput.nullable() }),
  z.object({ action: z.literal('shortcuts'), tiles }),
  z.object({
    action: z.literal('catalog'),
    subject,
    id: z.string().min(1).max(20),
    first: z.number().int().min(1),
    last: z.number().int().min(1).max(10000),
    order: z.number().int().min(0).max(200),
    source: z.string().trim().min(3).max(400),
  }),
  z.object({
    action: z.literal('observation'),
    context: z.literal('additional').optional(),
    inputMethod: z.literal('dictation').optional(),
    ...observations,
    visitId: z.string(),
    choices: tiles,
    text: z.string().trim().max(1200),
    followUp: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('handoff'),
    ...observations,
    subject: subject.optional(),
    activity: z.enum(['Worksheets', 'Corrections only', 'Both']).optional(),
    visitId: z.string(),
    expectedAt: z.string().nullable(),
    subjects: z
      .array(
        z.object({
          subject,
          assignmentId: z.string(),
          version: z.number().int(),
          activity: z.enum(['Worksheets', 'Corrections only', 'Both']),
          exception: z.boolean(),
          incoming: z
            .array(
              z.object({ id: z.string(), state: z.enum(['finished', 'unfinished', 'missing']) }),
            )
            .max(100),
          actual: z.array(packet).max(100).nullable(),
          center: packet.nullable().optional(),
          repeat: z
            .object({
              level: z.string(),
              start: z.number().int().min(1),
              restart: z.boolean(),
              packetsPerDay: z.number().int().min(0).max(10).optional(),
              sheetsPerPacket: z.number().int().min(1).max(100).optional(),
              reason: z.string().trim().max(400).optional(),
              startWith: z.enum(['today', 'homework']).optional(),
            })
            .nullable(),
          physicalConfirmed: z.boolean(),
          reason: z.string().trim().max(400),
        }),
      )
      .max(2),
    choices: tiles,
    text: z.string().trim().max(1200),
    followUp: z.boolean().default(false),
    correctionReason: z.string().trim().max(400).default(''),
  }),
  z.object({ action: z.literal('temporary-paper'), visitId: z.string(), subject, range }),
]);
export type V3Command = z.infer<typeof v3CommandInput>;
export function applyV3(db: Database, c: V3Command, staff: Staff, now = new Date()) {
  migrateV3(db, now);
  const op = db.operations!,
    at = now.toISOString();
  let id = '';
  const teacher = () => {
    if (staff.role === 'assistant')
      throw new DomainError('An instructor must complete instructional actions.', 403);
  };
  const findStudent = (key: string) => {
    const s = db.students.find((s) => s.id === key);
    if (!s) throw new DomainError('Student not found.', 404);
    return s;
  };
  const observe = (
    visitId: string,
    choices: string[],
    text: string,
    followUp: boolean,
    skillRatings: { id: string; label: string; score: number }[] = [],
  ) => {
    if (!choices.length && !text && !skillRatings.length) return;
    const v = db.visits.find((v) => v.id === visitId);
    if (!v) throw new DomainError('Visit not found.', 404);
    db.observations.push({
      id: randomUUID(),
      studentId: v.studentId,
      visitId,
      choices: [...new Set(choices)],
      ...(skillRatings.length ? { skillRatings } : {}),
      text,
      followUp,
      createdAt: at,
      author: staff.name,
      reviewedAt: null,
      reviewedBy: null,
    });
  };
  if (c.action === 'observation' || c.action === 'handoff') {
    teacher();
    const visit = db.visits.find((v) => v.id === c.visitId);
    if (!visit) throw new DomainError('Visit not found.', 404);
    if (new Set((c.skillRatings || []).map((s) => s.id)).size !== (c.skillRatings || []).length)
      throw new DomainError('Duplicate observation skills.');
    if (c.skillSettings) {
      const cfg = op.students[visit.studentId];
      if (cfg.version !== c.skillSettings.version)
        throw new DomainError('Student settings changed. Reopen Quick View before saving.', 409);
      if (new Set(c.skillSettings.skills.map((s) => s.id)).size !== c.skillSettings.skills.length)
        throw new DomainError('Duplicate observation skills.');
    }
  }
  if (c.action === 'observation-edit') {
    teacher();
    const entry = db.observations.find((o) => o.id === c.id);
    if (!entry) throw new DomainError('Observation not found.', 404);
    if ((entry.revisions?.length || 0) !== c.expectedVersion)
      throw new DomainError('Observation changed. Reopen the session before editing.', 409);
    const ratings = c.skillRatings || [];
    const previous = entry.revisions?.at(-1)?.skillRatings || entry.skillRatings || [];
    if (
      new Set(ratings.map((r) => r.id)).size !== ratings.length ||
      ratings.some((r) => !previous.some((p) => p.id === r.id && p.label === r.label))
    )
      throw new DomainError('Only the recorded observation skills can be edited.');
    (entry.revisions ??= []).push({
      at,
      actor: staff.name,
      text: c.text,
      skillRatings: structuredClone(ratings),
    });
    id = entry.id;
  } else if (c.action === 'prepare') {
    for (const key of c.ids) {
      const a = op.assignments.find((a) => a.id === key && a.v3);
      if (!a) throw new DomainError('Preparation not found.', 404);
      const v = a.v3!;
      if (v.issuedAt) throw new DomainError('Issued work cannot be marked prepared again.');
      if (c.versions[key] !== v.version)
        throw new DomainError('Preparation changed. Review the current set.', 409);
      if (a.stale && c.reprepare) {
        const fresh = paperProposal(db, a.studentId, a.subject, v.visitDate, a.id);
        if (!fresh) throw new DomainError('Paper preparation is paused.');
        fresh.v3!.version = v.version + 1;
        fresh.events = a.events;
        Object.assign(a, fresh);
      }
      if (a.v3!.review.length) throw new DomainError(a.v3!.review.join(' '));
      if (a.stale) throw new DomainError('Compare changed materials and explicitly reprepare.');
      if (!a.v3!.inCenter && !a.v3!.temporaryPaper)
        throw new DomainError('In-center packet missing.');
      if (a.v3!.inCenter) a.v3!.inCenter.prepared = true;
      a.v3!.planned.forEach((p) => (p.prepared = true));
      a.v3!.preparedAt = at;
      a.v3!.preparedBy = staff.name;
      a.v3!.adjustment = [];
      a.status = 'pulled';
      a.v3!.version++;
      a.updatedAt = at;
      a.events.push({
        at,
        actor: staff.name,
        status: 'pulled',
        reason: 'Entire displayed physical set prepared',
      });
      id = a.id;
    }
  } else if (c.action === 'student-save') {
    teacher();
    const s = findStudent(c.studentId),
      old = op.students[s.id];
    if (old.version !== c.settings.version)
      throw new DomainError('Student profile changed. Reopen Edit Student.', 409);
    if (!c.settings.active && db.visits.some((v) => v.studentId === s.id && isOpenVisit(v)))
      throw new DomainError('Reconcile the open attendance visit before withdrawing this student.');
    if (!c.settings.subjects.Math.enrolled && !c.settings.subjects.Reading.enrolled)
      throw new DomainError('Enroll at least one subject.');
    if (c.awayUntil && c.awayUntil < dayKey(now, op.center.timezone))
      throw new DomainError('Return date must be today or later.');
    if (c.awayUntil && (weekday(c.awayUntil) < 1 || weekday(c.awayUntil) > 4))
      throw new DomainError('Choose a Monday–Thursday first return date.');
    for (const sub of ['Math', 'Reading'] as Subject[]) {
      const next = c.settings.subjects[sub];
      const prior = old.subjects[sub];
      if (
        next.enrolled &&
        next.format === 'Paper' &&
        (next.level !== prior.level ||
          next.nextStart !== prior.nextStart ||
          prior.format !== 'Paper' ||
          !prior.enrolled)
      ) {
        const error = validateRange(db, sub, {
          level: next.level,
          start: next.nextStart,
          end: next.nextStart,
        });
        if (error) throw new DomainError(error);
      }
      if (next.level !== prior.level || next.nextStart !== prior.nextStart)
        op.decisions.push({
          id: randomUUID(),
          studentId: s.id,
          subject: sub,
          kind: next.level !== prior.level ? 'advance' : 'repeat-from',
          range: { level: next.level, start: next.nextStart, end: next.nextStart },
          note: 'Explicit permanent position set in Edit Student',
          createdAt: at,
          author: staff.name,
          approvedAt: at,
          approvedBy: staff.name,
        });
    }
    s.name = c.name;
    s.initials = c.name
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0])
      .join('');
    s.earlyLearner = c.earlyLearner;
    s.subjects = (['Math', 'Reading'] as Subject[]).filter(
      (sub) => c.settings.subjects[sub].enrolled,
    );
    op.students[s.id] = {
      ...old,
      ...c.settings,
      version: old.version + 1,
      visitDays: [...new Set(c.visitDays)],
      enrollmentDate: c.enrollmentDate,
      awayUntil: c.awayUntil === undefined ? old.awayUntil : c.awayUntil,
      observationTiles: c.tiles,
      goals: c.goals,
      arrivalWindow: c.arrivalWindow,
      updatedAt: at,
    };
    op.configHistory.push({
      studentId: s.id,
      at,
      subjects: structuredClone(c.settings.subjects),
      name: s.name,
      settings: structuredClone(op.students[s.id]),
    });
    id = s.id;
  } else if (c.action === 'away') {
    teacher();
    const s = findStudent(c.studentId),
      cfg = op.students[s.id];
    if (c.until && c.until < dayKey(now, op.center.timezone))
      throw new DomainError('Return date must be today or later.');
    if (c.until && (weekday(c.until) < 1 || weekday(c.until) > 4))
      throw new DomainError('Choose a Monday–Thursday first return date.');
    cfg.awayUntil = c.until;
    cfg.version++;
    cfg.updatedAt = at;
    id = s.id;
  } else if (c.action === 'shortcuts') {
    teacher();
    op.v3!.instructorTiles[staff.name] = c.tiles;
    id = staff.name;
  } else if (c.action === 'catalog') {
    if (staff.role !== 'owner')
      throw new DomainError('Only the owner approves catalog boundaries.', 403);
    if (c.last < c.first) throw new DomainError('Catalog boundary must be ordered.');
    const level = op.v3!.catalog.find((l) => l.id === c.id && l.subject === c.subject);
    const value = {
      subject: c.subject,
      id: c.id,
      order: c.order,
      first: c.first,
      last: c.last,
      approved: true,
      source: c.source,
    };
    if (level) Object.assign(level, value);
    else op.v3!.catalog.push(value);
    id = c.id;
  } else if (c.action === 'observation') {
    teacher();
    if (
      c.context === 'additional' &&
      (c.inputMethod !== 'dictation' ||
        !c.text.trim() ||
        c.choices.length ||
        c.skillRatings?.length)
    )
      throw new DomainError('Additional notes require a dictated transcript without ratings.');
    observe(c.visitId, c.choices, c.text, c.followUp, c.skillRatings);
    if (c.context === 'additional')
      Object.assign(db.observations.at(-1)!, { context: 'additional', inputMethod: 'dictation' });
    id = c.visitId;
  } else if (c.action === 'temporary-paper') {
    teacher();
    const visit = db.visits.find((v) => v.id === c.visitId);
    if (!visit || !isOpenVisit(visit) || visit.handoff)
      throw new DomainError('Temporary fallback requires a waiting open visit.');
    const error = validateRange(db, c.subject, c.range);
    if (error) throw new DomainError(error);
    if (currentSets(db, visit).some((a) => a.subject === c.subject))
      throw new DomainError('A paper set already exists for this subject. Adjust it instead.');
    const cfg = op.students[visit.studentId],
      old = cfg.subjects[c.subject];
    cfg.subjects[c.subject] = {
      ...old,
      enrolled: true,
      format: 'Paper',
      level: c.range.level,
      nextStart: c.range.start,
      sheetsPerPacket: c.range.end - c.range.start + 1,
      packetsPerDay: 0,
    };
    const a = paperProposal(
      db,
      visit.studentId,
      c.subject,
      dayKey(visit.arrivedAt, op.center.timezone),
      randomUUID(),
    )!;
    cfg.subjects[c.subject] = old;
    a.v3!.temporaryPaper = true;
    a.v3!.inCenter = null;
    a.v3!.planned = [
      {
        id: randomUUID(),
        sourceAssignmentId: a.id,
        range: c.range,
        purpose: 'homework',
        prepared: false,
        status: 'planned',
      },
    ];
    a.ranges = [c.range];
    op.assignments.push(a);
    id = a.id;
  } else {
    teacher();
    const visit = db.visits.find((v) => v.id === c.visitId);
    if (!visit) throw new DomainError('Visit not found.', 404);
    if (!c.subject && Object.keys(visit.subjectCheckIns || {}).length)
      throw new DomainError('This visit uses subject check-ins. Reopen Quick View.', 409);
    if (c.subject && !op.students[visit.studentId].subjects[c.subject].enrolled)
      throw new DomainError('Subject is not enrolled. Reopen Quick View.', 409);
    const recorded = c.subject
      ? visit.subjectCheckIns?.[c.subject] || visit.handoff
      : visit.handoff;
    if ((recorded?.at || null) !== c.expectedAt)
      throw new DomainError('Handoff changed on another device. Reopen Quick View.', 409);
    if (!recorded && !isOpenVisit(visit))
      throw new DomainError('Student has departed; save a visit note instead.');
    if (recorded && !c.correctionReason.trim())
      throw new DomainError('Explain a correction to an already-confirmed handoff.');
    const sets = currentSets(db, visit).filter((a) => !c.subject || a.subject === c.subject);
    if (c.subject && c.subjects.some((input) => input.subject !== c.subject))
      throw new DomainError('Only the selected subject can be checked in.');
    if (new Set(c.subjects.map((input) => input.assignmentId)).size !== c.subjects.length)
      throw new DomainError('Duplicate subject assignment.');
    if ((!recorded || c.subject) && sets.length !== c.subjects.length)
      throw new DomainError('Paper assignment changed. Reopen Quick View.', 409);
    const activities: Partial<Record<Subject, 'Worksheets' | 'Corrections only' | 'Both'>> = {};
    if (c.subject && !sets.length) activities[c.subject] = c.activity || 'Worksheets';
    const ids: string[] = [];
    const sessionRecords: import('./v3-model').SessionRecord[] = [];
    // All validation occurs against a transaction copy: thrown commands are never saved.
    for (const input of c.subjects) {
      const a = sets.find((a) => a.id === input.assignmentId && a.subject === input.subject);
      if (!a || a.v3!.version !== input.version)
        throw new DomainError('Paper set changed. Reopen Quick View.', 409);
      const v = a.v3!,
        cfg = op.students[visit.studentId].subjects[input.subject];
      const prior = incomingPackets(db, visit.studentId, input.subject, a.id);
      const recordedIncoming = prior.map((p) => ({
        packet: structuredClone(p),
        outcome:
          input.incoming.find((i) => i.id === p.id)?.state ||
          (p.status === 'unfinished' || p.status === 'missing'
            ? p.status
            : ('assumed completed' as const)),
      }));
      const incoming = prior.map((p) => ({
        ...p,
        status: input.incoming.find((i) => i.id === p.id)?.state || p.status,
      }));
      if (input.incoming.some((i) => !prior.some((p) => p.id === i.id)))
        throw new DomainError('Incoming packet does not belong to the student.');
      const returned = incoming.filter((p) => p.status === 'unfinished');
      const rebuilding = !!c.subject && (input.center !== undefined || !!input.repeat?.startWith);
      if (input.center !== undefined && !c.subject)
        throw new DomainError('Center adjustment requires a subject check-in.');
      if (rebuilding && !(input.reason || input.repeat?.reason)?.trim())
        throw new DomainError('Enter an adjustment or repeat reason.');
      let subjectReview: ReturnType<typeof reuseSequence> | null = c.subject
        ? subjectPlan(db, a, input.activity, returned, input.actual?.length)
        : null;
      let recommended: { out: Packet[]; held: Packet[]; review: string[] } =
        subjectReview ||
        recommend(
          a,
          input.activity,
          input.exception && !c.subject ? incoming.filter((p) => p.status === 'unfinished') : [],
        );
      let actual = input.actual ? structuredClone(input.actual) : recommended.out;
      if (input.center !== undefined && !input.repeat?.startWith) {
        if (input.activity !== 'Corrections only' && !input.center)
          throw new DomainError('Choose one in-center packet for Packet or Both.');
        if (input.activity === 'Corrections only' && input.center)
          throw new DomainError('Corrections-only cannot have an in-center packet.');
        subjectReview = reuseSequence(db, a, input.center, actual, returned);
        recommended = subjectReview;
        actual = subjectReview.out;
      }
      if (input.repeat) {
        if (c.subject && input.repeat.startWith) {
          const proposal = repeatSequence(
            db,
            a,
            {
              level: input.repeat.level,
              start: input.repeat.start,
              packetsPerDay: input.repeat.packetsPerDay ?? cfg.packetsPerDay,
              sheetsPerPacket: input.repeat.sheetsPerPacket ?? cfg.sheetsPerPacket,
              startWith: input.repeat.startWith,
            },
            input.activity,
            input.center || subjectReview!.center,
            returned,
          );
          if (!proposal || proposal.v3!.review.length)
            throw new DomainError(
              proposal?.v3!.review.join(' ') || 'Repeat planning is unavailable.',
            );
          subjectReview = reuseSequence(
            db,
            a,
            proposal.v3!.inCenter,
            proposal.v3!.planned,
            returned,
          );
          recommended = subjectReview;
          actual = subjectReview.out;
          v.review = [];
        } else if (
          input.repeat.packetsPerDay !== undefined ||
          input.repeat.sheetsPerPacket !== undefined
        ) {
          if (!input.repeat.reason?.trim()) throw new DomainError('Enter a repeat reason.');
          const preview = structuredClone(db);
          preview.operations!.students[visit.studentId].subjects[input.subject] = {
            ...cfg,
            level: input.repeat.level,
            nextStart: input.repeat.start,
            packetsPerDay: input.repeat.packetsPerDay ?? cfg.packetsPerDay,
            sheetsPerPacket: input.repeat.sheetsPerPacket ?? cfg.sheetsPerPacket,
          };
          const proposal = paperProposal(
            preview,
            visit.studentId,
            input.subject,
            v.visitDate,
            a.id + ':repeat:' + v.version,
            true,
          );
          if (!proposal || proposal.v3!.review.length)
            throw new DomainError(
              proposal?.v3!.review.join(' ') || 'Repeat planning is unavailable.',
            );
          if (v.inCenter) v.held.push({ ...v.inCenter, status: 'held' });
          v.inCenter = proposal.v3!.inCenter;
          v.review = [];
          if (c.subject) {
            subjectReview = subjectPlan(db, proposal, input.activity, returned);
            recommended = subjectReview;
            actual = subjectReview.out;
          } else actual = proposal.v3!.planned;
        } else {
          const start = input.repeat.start,
            size = cfg.sheetsPerPacket;
          actual = Array.from({ length: actual.length }, (_, i) => ({
            id: randomUUID(),
            range: {
              level: input.repeat!.level,
              start: start + i * size,
              end: start + (i + 1) * size - 1,
            },
            sourceAssignmentId: a.id,
            purpose: 'homework' as const,
            prepared: false,
            status: 'planned' as const,
          }));
        }
      }
      if (subjectReview) {
        if (subjectReview.center) {
          const error = validateRange(db, input.subject, subjectReview.center.range);
          if (error) throw new DomainError(error);
        }
        if (
          v.inCenter &&
          v.inCenter.id !== subjectReview.center?.id &&
          !actual.some((p) => p.id === v.inCenter!.id)
        )
          v.held.push({ ...v.inCenter, status: 'held' });
        v.inCenter = subjectReview.center;
      }
      if (v.review.length) throw new DomainError(v.review.join(' '));
      if (recommended.review.length && !input.actual && (subjectReview || !input.repeat))
        throw new DomainError(recommended.review.join(' '));
      if (a.stale && !input.physicalConfirmed)
        throw new DomainError('Confirm the physical adjustment after settings changed.');
      const seen = new Set<string>();
      if (
        subjectReview &&
        !rebuilding &&
        returned.some((p) => p.id !== v.inCenter?.id && !actual.some((q) => q.id === p.id))
      )
        throw new DomainError('Include every remaining unfinished packet in outgoing homework.');
      for (const p of actual) {
        const error = validateRange(db, input.subject, p.range);
        if (error) throw new DomainError(error);
        if (
          subjectReview &&
          v.inCenter &&
          p.range.level === v.inCenter.range.level &&
          p.range.start <= v.inCenter.range.end &&
          v.inCenter.range.start <= p.range.end
        )
          throw new DomainError("Today's packet cannot also be outgoing homework.");
        for (let n = p.range.start; n <= p.range.end; n++) {
          const key = p.range.level + ':' + n;
          if (seen.has(key))
            throw new DomainError('Duplicate worksheets in actual outgoing assignment.');
          seen.add(key);
        }
        const source = prior.find((q) => q.id === p.id);
        if (source && input.incoming.find((i) => i.id === source.id)?.state !== 'unfinished')
          throw new DomainError(
            'Only explicitly returned unfinished packets can be automatically reissued.',
          );
        const collision = incoming.find(
          (q) =>
            q.status === 'missing' &&
            q.range.level === p.range.level &&
            q.range.start <= p.range.end &&
            p.range.start <= q.range.end,
        );
        if (collision && !input.reason.trim())
          throw new DomainError(
            'Missing work conflicts with this assignment. Explain the explicit replacement.',
          );
      }
      const physicallyReady = (p: Packet) =>
        [v.inCenter, ...v.planned, ...incoming.filter((q) => q.status === 'unfinished')].some(
          (q) =>
            q &&
            q.range.level === p.range.level &&
            q.range.start === p.range.start &&
            q.range.end === p.range.end &&
            (q.prepared || q.status === 'unfinished'),
        );
      if ((!v.preparedAt || actual.some((p) => !physicallyReady(p))) && !input.physicalConfirmed)
        throw new DomainError(
          'Confirm that newly required physical material has been adjusted and handed over.',
        );
      const newActual = actual.map((p) => ({
        ...p,
        prepared: true,
        status: 'issued' as const,
        purpose: 'homework' as const,
      }));
      const issuedIds = new Set(newActual.map((p) => p.id));
      const allocatedIds = new Set([...issuedIds, ...(v.inCenter ? [v.inCenter.id] : [])]);
      v.held = [
        ...new Map(
          [
            ...v.held.filter((p) => !allocatedIds.has(p.id)),
            ...(rebuilding ? returned.filter((p) => !allocatedIds.has(p.id)) : []),
            ...(subjectReview?.held || []).filter((p) => !allocatedIds.has(p.id)),
            ...v.planned.filter((p) => !allocatedIds.has(p.id)),
            ...(v.inCenter && input.activity === 'Corrections only' && !issuedIds.has(v.inCenter.id)
              ? [v.inCenter]
              : []),
          ].map((p) => [p.id, { ...p, status: 'held' as const }]),
        ).values(),
      ];
      // Reissued physical packet IDs stay stable, and prior assignments retain
      // the disposition. Ordinary receipt is a planning assumption, not a ledger.
      for (const other of op.assignments.filter(
        (o) =>
          o.v3 && o.studentId === visit.studentId && o.subject === input.subject && o.id !== a.id,
      ))
        for (const p of other.v3!.issued) {
          const state = input.incoming.find((i) => i.id === p.id)?.state;
          if (input.exception && state) {
            p.status = state;
            other.v3!.reconciliations.push({
              packetId: p.id,
              state,
              visitId: visit.id,
              at,
              actor: staff.name,
            });
          } else if (!input.exception && p.status === 'issued') p.status = 'routine';
          if (allocatedIds.has(p.id) || (rebuilding && returned.some((q) => q.id === p.id)))
            p.status = 'held';
        }
      v.issued = newActual;
      if (c.subject)
        v.inCenterReturns = incoming
          .filter((p) => p.status === 'unfinished' && p.id === v.inCenter?.id)
          .map((p) => ({ ...p, status: 'unfinished' }));
      if (v.inCenter) {
        v.inCenter.status =
          input.activity === 'Corrections only'
            ? issuedIds.has(v.inCenter.id)
              ? 'issued'
              : 'held'
            : 'issued';
        v.inCenter.prepared = true;
      }
      v.visitId = visit.id;
      v.issuedAt = at;
      v.version++;
      v.adjustment = [];
      a.stale = false;
      a.status = 'distributed';
      a.updatedAt = at;
      a.events.push({
        at,
        actor: staff.name,
        status: 'distributed',
        reason: input.reason || c.correctionReason || 'Explicit instructor handoff',
      });
      if (input.repeat)
        op.decisions.push({
          id: randomUUID(),
          studentId: visit.studentId,
          subject: input.subject,
          kind: input.repeat.restart ? 'repeat-from' : 'repeat-range',
          range: {
            level: input.repeat.level,
            start: input.repeat.start,
            end: newActual.at(-1)?.range.end || input.repeat.start,
          },
          note:
            input.repeat.reason ||
            input.reason ||
            (input.repeat.restart
              ? 'Explicit permanent progression restart'
              : 'One-time repeat; permanent cursor not reset'),
          createdAt: at,
          author: staff.name,
          approvedAt: at,
          approvedBy: staff.name,
        });
      if (!v.temporaryPaper) {
        if (input.repeat?.restart) {
          cfg.level = input.repeat.level;
          cfg.nextStart = newActual.at(-1)?.range.end
            ? newActual.at(-1)!.range.end + 1
            : input.repeat.start;
        } else if (!input.repeat) {
          const ends = newActual
            .filter((p) => p.range.level === cfg.level)
            .map((p) => p.range.end + 1);
          cfg.nextStart = Math.max(
            cfg.nextStart,
            v.inCenter && input.activity !== 'Corrections only'
              ? v.inCenter.range.end + 1
              : cfg.nextStart,
            ...ends,
          );
        }
      }
      activities[input.subject] = input.activity;
      sessionRecords.push({
        subject: input.subject,
        at,
        actor: staff.name,
        activity: input.activity,
        format: 'Paper',
        incoming: recordedIncoming,
        center: structuredClone(input.activity === 'Corrections only' ? null : v.inCenter),
        outgoing: structuredClone(v.issued),
        reason: input.reason || input.repeat?.reason || c.correctionReason,
      });
      ids.push(a.id);
    }
    if (c.subject && !sets.length)
      sessionRecords.push({
        subject: c.subject,
        at,
        actor: staff.name,
        activity: c.activity || 'Worksheets',
        format: 'CONNECT',
        incoming: [],
        center: null,
        outgoing: [],
        reason: c.correctionReason,
      });
    (visit.sessionRecords ??= []).push(...sessionRecords);
    const confirmation = {
      at: recorded?.at || at,
      actor: recorded?.actor || staff.name,
      activities,
      assignmentIds: ids,
      incoming: c.subjects.some((s) => s.exception)
        ? ('exception' as const)
        : ('routine-no-exception' as const),
      events: [
        ...(recorded?.events || []),
        { at, actor: staff.name, reason: c.correctionReason || 'Instructor check-in completed' },
      ],
    };
    if (c.subject) {
      visit.subjectCheckIns ??= {};
      const enrolled = (['Math', 'Reading'] as Subject[]).filter(
        (s) => op.students[visit.studentId].subjects[s].enrolled,
      );
      // Preserve confirmations from older combined records when correcting one subject.
      if (visit.handoff)
        for (const s of enrolled) {
          if (visit.subjectCheckIns[s]) continue;
          const assignmentIds = visit.handoff.assignmentIds.filter((id) =>
            op.assignments.some((a) => a.id === id && a.subject === s),
          );
          if (
            visit.handoff.activities[s] ||
            assignmentIds.length ||
            op.students[visit.studentId].subjects[s].format === 'CONNECT'
          )
            visit.subjectCheckIns[s] = {
              ...visit.handoff,
              activities: visit.handoff.activities[s] ? { [s]: visit.handoff.activities[s] } : {},
              assignmentIds,
            };
        }
      visit.subjectCheckIns[c.subject] = confirmation;
      if (enrolled.every((s) => visit.subjectCheckIns?.[s])) {
        const confirmations = enrolled.map((s) => visit.subjectCheckIns![s]!);
        visit.handoff = {
          ...confirmation,
          at: visit.handoff?.at || confirmation.at,
          actor: visit.handoff?.actor || confirmation.actor,
          activities: Object.assign({}, ...confirmations.map((h) => h.activities)),
          assignmentIds: confirmations.flatMap((h) => h.assignmentIds),
          incoming: confirmations.some((h) => h.incoming === 'exception')
            ? 'exception'
            : 'routine-no-exception',
          events: confirmations.flatMap((h) => h.events),
        };
      }
    } else visit.handoff = confirmation;
    observe(visit.id, c.choices, c.text, c.followUp, c.skillRatings);
    id = visit.id;
  }
  if ((c.action === 'observation' || c.action === 'handoff') && c.skillSettings) {
    const visit = db.visits.find((v) => v.id === c.visitId)!;
    const cfg = op.students[visit.studentId];
    cfg.observationSkills = c.skillSettings.skills.map((s) => ({ ...s }));
    cfg.version++;
    cfg.updatedAt = at;
  }
  if (c.action !== 'observation' && c.action !== 'observation-edit' && c.action !== 'shortcuts')
    synchronizePreparation(db, dayKey(now, op.center.timezone));
  db.audit.push({
    id: randomUUID(),
    action: 'v3:' + c.action,
    actor: staff.name,
    at,
    entityId: id,
  });
  return id;
}
