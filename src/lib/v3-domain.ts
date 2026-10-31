import { preserveDailyWork } from './worksheet-allocation';
import { subjectNeedsSetup } from './student-setup';
import { randomUUID } from 'node:crypto';
import { centerFeatures } from './center-features';
import { activityHoursInput, activitySettings } from './activity-settings';
import { kioskSettings } from './kiosk-settings';
import { verificationPackets } from './completion-evidence';
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
  withSubjectSettings,
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
const skill = z.object({
  id: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(48),
});
const observations = {
  skillRatings: z
    .array(skill.extend({ score: z.number().int().min(1).max(5) }))
    .max(12)
    .optional(),
  skillSettings: z.object({ version: z.number().int(), skills: z.array(skill).max(12) }).optional(),
};
export const v3CommandInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('verify-sheets'),
    visitId: z.string(),
    subject,
    packetId: z.string(),
    expectedSourceVersion: z.number().int().min(0),
    expectedVerificationVersion: z.number().int().min(0),
    worksheets: z.array(z.number().int().min(1).max(10000)).min(1).max(1000),
    completedDate: dateInput,
    reason: z.string().trim().min(3).max(500),
    supersedes: z.string().optional(),
  }),
  z.object({
    action: z.literal('kiosk-settings'),
    expectedVersion: z.number().int().min(0),
    confirmationSeconds: z.number().int().min(2).max(10),
  }),
  z.object({
    action: z.literal('activity-hours'),
    expectedVersion: z.number().int().min(0),
    days: activityHoursInput,
  }),
  z.object({
    action: z.literal('center-features'),
    expectedVersion: z.number().int().min(0),
    homework: z.boolean(),
    medals: z.boolean(),
    resumeReviewed: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('activity-check-in'),
    ...observations,
    visitId: z.string(),
    subject,
    activity: z.enum(['Worksheets', 'Corrections only', 'Both']),
    expectedAt: z.string().nullable(),
    expectedFeaturesVersion: z.number().int().min(0),
    text: z.string().trim().max(1200),
    correctionReason: z.string().trim().max(400).default(''),
  }),
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
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    earlyLearner: z.boolean(),
    settings: studentSettingsInput,
    enrollmentDate: dateInput.nullable(),
    awayUntil: dateInput.nullable().optional(),
    visitDays: z.array(z.number().int().min(1).max(4)).max(4),
    tiles,
    goals: z.string().trim().max(400),
    arrivalWindow: z.string().max(40).default(''),
  }),
  z.object({
    action: z.literal('away'),
    studentId: z.string(),
    until: dateInput.nullable(),
  }),
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
    expectedFeaturesVersion: z.number().int().min(0).optional(),
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
              z.object({
                id: z.string(),
                state: z.enum(['finished', 'unfinished', 'missing']),
              }),
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
  z.object({
    action: z.literal('temporary-paper'),
    visitId: z.string(),
    subject,
    range,
  }),
]);
export type V3Command = z.infer<typeof v3CommandInput>;
export function applyV3(db: Database, c: V3Command, staff: Staff, now = new Date()) {
  migrateV3(db, now);
  const op = db.operations!,
    at = now.toISOString();
  const features = centerFeatures(db);
  if (
    c.action === 'handoff' &&
    c.expectedFeaturesVersion !== undefined &&
    c.expectedFeaturesVersion !== features.version
  )
    throw new DomainError('Center features changed. Reopen Quick View.', 409);
  if (!features.homework && ['prepare', 'handoff', 'temporary-paper', 'catalog'].includes(c.action))
    throw new DomainError('Homework workflows are turned off for this center.', 409);
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
  if (c.action === 'observation' || c.action === 'handoff' || c.action === 'activity-check-in') {
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
  if (c.action === 'verify-sheets') {
    teacher();
    const visit = db.visits.find((v) => v.id === c.visitId);
    const evidence = verificationPackets(db, c.visitId, c.subject).find(
      (e) => e.packet.id === c.packetId,
    );
    if (!visit || !evidence)
      throw new DomainError('No issued paper packet evidence is available for this session.', 409);
    const { packet, source } = evidence;
    if (
      source.v3!.version !== c.expectedSourceVersion ||
      evidence.verificationVersion !== c.expectedVerificationVersion
    )
      throw new DomainError(
        'Packet or verification changed. Reopen the session before saving.',
        409,
      );
    if (c.completedDate > dayKey(now, op.center.timezone) || c.completedDate < source.fromDate)
      throw new DomainError(
        'Completion date must be on/after the packet planning date and not in the future.',
      );
    if (
      new Set(c.worksheets).size !== c.worksheets.length ||
      c.worksheets.some((n) => n < packet.range.start || n > packet.range.end)
    )
      throw new DomainError('Verify unique worksheet identities within the recorded packet.');
    const active = op.completions.filter(
      (e) =>
        e.active &&
        e.studentId === visit.studentId &&
        e.subject === c.subject &&
        (e.packetId === packet.id ||
          (!e.packetId && e.assignmentId === source.id && e.level === packet.range.level)),
    );
    const prior = c.supersedes
      ? active.find((e) => e.id === c.supersedes && e.packetId === packet.id)
      : undefined;
    if (c.supersedes && !prior)
      throw new DomainError('The verification to correct is no longer active.', 409);
    const others = active.filter((e) => e.id !== prior?.id).flatMap((e) => e.worksheets);
    if (c.worksheets.some((n) => others.includes(n)))
      throw new DomainError('These physical sheets already have active verification.');
    if (prior) prior.active = false;
    id = randomUUID();
    op.completions.push({
      id,
      packetId: packet.id,
      visitId: visit.id,
      ...(prior ? { supersedes: prior.id } : {}),
      assignmentId: source.id,
      studentId: visit.studentId,
      subject: c.subject,
      level: packet.range.level,
      worksheets: [...c.worksheets].sort((a, b) => a - b),
      physicalSheets: c.worksheets.length,
      format: 'Paper',
      completedDate: c.completedDate,
      officialCount: null,
      verifiedBy: staff.name,
      at,
      active: true,
      reason: c.reason,
    });
  } else if (c.action === 'kiosk-settings') {
    if (staff.role !== 'owner')
      throw new DomainError('Only the owner can change kiosk settings.', 403);
    if (c.expectedVersion !== kioskSettings(db).version)
      throw new DomainError('Kiosk settings changed. Reload Settings before saving.', 409);
    op.v3!.kiosk = {
      version: c.expectedVersion + 1,
      confirmationSeconds: c.confirmationSeconds,
    };
    id = 'kiosk-settings';
  } else if (c.action === 'activity-hours') {
    teacher();
    if (c.expectedVersion !== activitySettings(db).version)
      throw new DomainError('Activity hours changed. Reopen Settings.', 409);
    op.v3!.activityHours = {
      version: c.expectedVersion + 1,
      days: activityHoursInput.parse(c.days),
    };
    id = 'activity-hours';
  } else if (c.action === 'center-features') {
    if (staff.role !== 'owner')
      throw new DomainError('Only the owner can change center features.', 403);
    if (c.expectedVersion !== features.version)
      throw new DomainError('Center features changed. Reopen Settings.', 409);
    if (c.homework && !features.homework && !c.resumeReviewed)
      throw new DomainError(
        'Review current levels and saved packet plans before resuming homework.',
      );
    op.v3!.features = {
      homework: c.homework,
      medals: c.medals,
      version: features.version + 1,
    };
    id = 'center-features';
  } else if (c.action === 'activity-check-in') {
    const visit = db.visits.find((v) => v.id === c.visitId)!;
    const cfg = op.students[visit.studentId];
    if (
      (features.homework && !subjectNeedsSetup(cfg.subjects[c.subject])) ||
      features.version !== c.expectedFeaturesVersion
    )
      throw new DomainError(
        'Center features changed or subject setup completed. Reopen Quick View.',
        409,
      );
    if (!cfg.subjects[c.subject].enrolled) throw new DomainError('Subject is not enrolled.', 409);
    const recorded =
      visit.subjectCheckIns?.[c.subject] ||
      (visit.handoff?.activities[c.subject] ? visit.handoff : undefined);
    if ((recorded?.at || null) !== c.expectedAt)
      throw new DomainError('Check-in changed. Reopen Quick View.', 409);
    if (!isOpenVisit(visit))
      throw new DomainError('Student has departed; save observations instead.');
    if (recorded && !c.correctionReason.trim())
      throw new DomainError('Explain the change to this activity.');
    const confirmation: import('./v3-model').Handoff = {
      mode: 'activity-only',
      at: recorded?.at || at,
      actor: recorded?.actor || staff.name,
      activities: { [c.subject]: c.activity },
      assignmentIds: [],
      incoming: 'unknown',
      events: [
        ...(recorded?.events || []),
        {
          at,
          actor: staff.name,
          reason: c.correctionReason || 'Activity recorded',
        },
      ],
    };
    (visit.sessionRecords ??= []).push({
      mode: 'activity-only',
      subject: c.subject,
      at,
      actor: staff.name,
      activity: c.activity,
      format: cfg.subjects[c.subject].format,
      incoming: [],
      center: null,
      outgoing: [],
      reason: c.correctionReason,
    });
    visit.subjectCheckIns ??= {};
    const enrolled = (['Math', 'Reading'] as Subject[]).filter((s) => cfg.subjects[s].enrolled);
    if (visit.handoff)
      for (const s of enrolled) {
        if (!visit.subjectCheckIns[s] && visit.handoff.activities[s])
          visit.subjectCheckIns[s] = {
            ...visit.handoff,
            activities: { [s]: visit.handoff.activities[s] },
            assignmentIds: visit.handoff.assignmentIds.filter((key) =>
              op.assignments.some((a) => a.id === key && a.subject === s),
            ),
          };
      }
    visit.subjectCheckIns[c.subject] = confirmation;
    if (enrolled.every((s) => visit.subjectCheckIns?.[s])) {
      const confirmed = enrolled.map((s) => visit.subjectCheckIns![s]!);
      visit.handoff = {
        ...confirmation,
        activities: Object.assign({}, ...confirmed.map((h) => h.activities)),
        assignmentIds: confirmed.flatMap((h) => h.assignmentIds),
        events: confirmed.flatMap((h) => h.events),
      };
    }
    observe(visit.id, [], c.text, false, c.skillRatings);
    id = visit.id;
  } else if (c.action === 'observation-edit') {
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
      if (subjectNeedsSetup(op.students[a.studentId].subjects[a.subject]))
        throw new DomainError('Complete subject setup before preparing worksheets.', 409);
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
    const settings = {
      ...c.settings,
      subjects: {
        Math: preserveDailyWork(old.subjects.Math, c.settings.subjects.Math),
        Reading: preserveDailyWork(old.subjects.Reading, c.settings.subjects.Reading),
      },
    };
    for (const subject of ['Math', 'Reading'] as Subject[])
      if (
        old.subjects[subject].setupPending === true &&
        settings.subjects[subject].setupPending === undefined
      )
        throw new DomainError('Student setup changed. Reopen the current profile editor.', 409);
    if (!features.homework)
      for (const sub of ['Math', 'Reading'] as Subject[]) {
        const keys = [
          'level',
          'currentStart',
          'currentEnd',
          'nextStart',
          'packetsPerDay',
          'sheetsPerPacket',
          'classworkSheets',
        ] as const;
        if (
          keys.some((key) => settings.subjects[sub][key] !== old.subjects[sub][key]) ||
          JSON.stringify(settings.subjects[sub].dailyWork) !==
            JSON.stringify(old.subjects[sub].dailyWork)
        )
          throw new DomainError(
            'Homework workflows are turned off. Reopen the student profile.',
            409,
          );
      }
    if (old.version !== settings.version)
      throw new DomainError('Student profile changed. Reopen Edit Student.', 409);
    if (c.firstName !== undefined || c.lastName !== undefined) {
      if (!c.firstName || !c.lastName || `${c.firstName} ${c.lastName}` !== c.name)
        throw new DomainError('First and last names must match the displayed student name.');
    } else if ((s.firstName || s.lastName) && c.name !== s.name)
      throw new DomainError('Use the current profile editor to update first and last names.', 409);
    if (!settings.active && db.visits.some((v) => v.studentId === s.id && isOpenVisit(v)))
      throw new DomainError('Reconcile the open attendance visit before withdrawing this student.');
    if (!c.visitDays.length && !old.setupPending && !old.intake)
      throw new DomainError('Choose at least one regular visit day.');
    if (
      !settings.subjects.Math.enrolled &&
      !settings.subjects.Reading.enrolled &&
      !old.setupPending
    )
      throw new DomainError('Enroll at least one subject.');
    if (c.awayUntil && c.awayUntil < dayKey(now, op.center.timezone))
      throw new DomainError('Return date must be today or later.');
    if (c.awayUntil && (weekday(c.awayUntil) < 1 || weekday(c.awayUntil) > 4))
      throw new DomainError('Choose a Monday–Thursday first return date.');
    for (const sub of ['Math', 'Reading'] as Subject[]) {
      const next = settings.subjects[sub];
      const prior = old.subjects[sub];
      if (
        features.homework &&
        next.enrolled &&
        !subjectNeedsSetup(next) &&
        next.format === 'Paper' &&
        (next.level !== prior.level ||
          next.nextStart !== prior.nextStart ||
          prior.format !== 'Paper' ||
          !prior.enrolled ||
          subjectNeedsSetup(prior))
      ) {
        const error = validateRange(db, sub, {
          level: next.level,
          start: next.nextStart,
          end: next.nextStart,
        });
        if (error) throw new DomainError(error);
      }
      if (
        !subjectNeedsSetup(next) &&
        (next.level !== prior.level || next.nextStart !== prior.nextStart)
      )
        op.decisions.push({
          id: randomUUID(),
          studentId: s.id,
          subject: sub,
          kind: next.level !== prior.level ? 'advance' : 'repeat-from',
          range: {
            level: next.level,
            start: next.nextStart,
            end: next.nextStart,
          },
          note: 'Explicit permanent position set in Edit Student',
          createdAt: at,
          author: staff.name,
          approvedAt: at,
          approvedBy: staff.name,
        });
    }
    s.name = c.name;
    if (c.firstName !== undefined && c.lastName !== undefined) {
      s.firstName = c.firstName;
      s.lastName = c.lastName;
    }
    s.initials = c.name
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0])
      .join('');
    s.earlyLearner = c.earlyLearner;
    s.subjects = (['Math', 'Reading'] as Subject[]).filter(
      (sub) => settings.subjects[sub].enrolled,
    );
    op.students[s.id] = {
      ...old,
      ...settings,
      setupPending:
        !c.visitDays.length ||
        !(['Math', 'Reading'] as Subject[]).some((sub) => settings.subjects[sub].enrolled) ||
        (['Math', 'Reading'] as Subject[]).some(
          (sub) => settings.subjects[sub].enrolled && subjectNeedsSetup(settings.subjects[sub]),
        ),
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
      subjects: structuredClone(settings.subjects),
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
      Object.assign(db.observations.at(-1)!, {
        context: 'additional',
        inputMethod: 'dictation',
      });
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
    if (subjectNeedsSetup(old))
      throw new DomainError('Complete subject setup before issuing temporary paper.', 409);
    cfg.subjects[c.subject] = {
      ...old,
      enrolled: true,
      format: 'Paper',
      level: c.range.level,
      nextStart: c.range.start,
      sheetsPerPacket: c.range.end - c.range.start + 1,
      packetsPerDay: 0,
      dailyWork: undefined,
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
    if (
      (c.subject ? [c.subject] : (['Math', 'Reading'] as Subject[])).some(
        (subject) =>
          op.students[visit.studentId].subjects[subject].enrolled &&
          subjectNeedsSetup(op.students[visit.studentId].subjects[subject]),
      )
    )
      throw new DomainError(
        'Complete subject setup before recording a homework handoff. Save observations instead.',
        409,
      );
    const previousRecord = c.subject
      ? visit.subjectCheckIns?.[c.subject] || visit.handoff
      : visit.handoff;
    const recorded = previousRecord?.mode === 'activity-only' ? undefined : previousRecord;
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
          const preview = withSubjectSettings(db, visit.studentId, input.subject, {
            level: input.repeat.level,
            nextStart: input.repeat.start,
            packetsPerDay: input.repeat.packetsPerDay ?? cfg.packetsPerDay,
            sheetsPerPacket: input.repeat.sheetsPerPacket ?? cfg.sheetsPerPacket,
          });
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
        {
          at,
          actor: staff.name,
          reason: c.correctionReason || 'Instructor check-in completed',
        },
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
  if (
    (c.action === 'observation' || c.action === 'handoff' || c.action === 'activity-check-in') &&
    c.skillSettings
  ) {
    const visit = db.visits.find((v) => v.id === c.visitId)!;
    const cfg = op.students[visit.studentId];
    cfg.observationSkills = c.skillSettings.skills.map((s) => ({ ...s }));
    cfg.version++;
    cfg.updatedAt = at;
  }
  if (
    ![
      'observation',
      'observation-edit',
      'shortcuts',
      'center-features',
      'activity-hours',
      'kiosk-settings',
      'verify-sheets',
      'activity-check-in',
    ].includes(c.action)
  )
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
