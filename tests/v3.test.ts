import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/lib/seed';
import { migrateV2 } from '../src/lib/migrate';
import { migrateV3 } from '../src/lib/v3-migrate';
import { attendance } from '../src/lib/domain';
import { applyV3, v3CommandInput, type V3Command } from '../src/lib/v3-domain';
import { applyV2 } from '../src/lib/v2-domain';
import {
  currentSets,
  dailyRoster,
  homeRoster,
  packetLabel,
  paperProposal,
  recommend,
  synchronizePreparation,
  validateRange,
  incomingPackets,
} from '../src/lib/v3-planning';
import {
  centerActivity,
  filterRoster,
  matchVisit,
  measuredMinutes,
  type RosterFilter,
} from '../src/lib/v3-analytics';
import { expectedOn, nextExpected } from '../src/lib/schedule';
import { buildReport, runDueJobs } from '../src/lib/reports';
import { kioskScan } from '../src/lib/kiosk-attendance';
import type { Database, Staff, Visit } from '../src/lib/model';
const now = new Date('2026-10-12T20:00:00Z'),
  teacher: Staff = { name: 'Fictional Instructor', role: 'instructor' },
  owner: Staff = { name: 'Fictional Owner', role: 'owner' };
function fixture() {
  const db = seed(now);
  migrateV3(db, now);
  db.visits = [];
  db.observations = [];
  const c = db.operations!.students[db.students[0].id];
  c.visitDays = [1, 3];
  c.subjects.Math = {
    ...c.subjects.Math,
    enrolled: true,
    format: 'Paper',
    level: 'D',
    nextStart: 16,
    packetsPerDay: 1,
    sheetsPerPacket: 5,
  };
  c.subjects.Reading.enrolled = false;
  return db;
}
function proposal(db: Database, date = '2026-10-12') {
  const a = paperProposal(db, db.students[0].id, 'Math', date, crypto.randomUUID());
  if (a) db.operations!.assignments.push(a);
  return a!;
}
function arrive(db: Database, at = now) {
  attendance(db, db.students[0].id, 'in', at, teacher.name);
  synchronizePreparation(db, '2026-10-12');
  return db.visits.at(-1)!;
}
function prepare(db: Database, v: Visit) {
  const sets = currentSets(db, v);
  for (const a of sets)
    applyV3(
      db,
      {
        action: 'prepare',
        ids: [a.id],
        versions: { [a.id]: a.v3!.version },
        reprepare: false,
      },
      teacher,
      now,
    );
}
function command(
  db: Database,
  v: Visit,
  patch: Partial<Extract<V3Command, { action: 'handoff' }>['subjects'][number]> = {},
): Extract<V3Command, { action: 'handoff' }> {
  return {
    action: 'handoff',
    visitId: v.id,
    expectedAt: v.handoff?.at || null,
    subjects: currentSets(db, v).map((a) => ({
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
      ...patch,
    })),
    choices: [],
    text: '',
    followUp: false,
    correctionReason: '',
  };
}
const filter: RosterFilter = {
  query: '',
  format: 'All',
  subject: 'All',
  early: false,
  days: [],
  medal: 'All',
  status: 'Active',
};

test('V3 migration preserves every original identity/history and leaves enrollment dates unknown (60)', () => {
  const db = seed(now);
  migrateV2(db, now);
  const old = structuredClone(db);
  migrateV3(db, now);
  assert.equal(db.schemaVersion, 3);
  for (const key of ['students', 'visits', 'observations', 'homework'] as const)
    assert.deepEqual(db[key], old[key]);
  assert.equal(db.students.length, 96);
  assert.equal(migrateV3(db), false);
  assert.equal(db.operations!.students[db.students[0].id].enrollmentDate, null);
});
test('physical attendance and accidental kiosk repeat never confirm handoff (1–3,12)', () => {
  const db = fixture();
  kioskScan(db, db.students[0].token, now);
  assert.equal(db.visits.length, 1);
  assert.equal(db.visits[0].handoff, undefined);
  kioskScan(db, db.students[0].token, new Date(now.getTime() + 5000));
  assert.equal(db.visits[0].departedAt, null);
  assert.equal(db.visits.length, 1);
});
test('handoff confirmation records attribution/actual issue and generates next prep once (4,24,25,32,44)', () => {
  const db = fixture(),
    v = arrive(db);
  prepare(db, v);
  const a = currentSets(db, v)[0];
  assert.equal(a.v3!.issuedAt, null);
  applyV3(db, command(db, v), teacher, now);
  assert.equal(v.handoff!.actor, teacher.name);
  assert.equal(a.v3!.issued.length, 1);
  assert.equal(packetLabel(a.v3!.issued[0]), 'D21–25');
  const next = db.operations!.assignments.find(
    (a) => a.v3?.visitDate === '2026-10-14' && a.studentId === v.studentId && a.subject === 'Math',
  )!;
  assert.equal(packetLabel(next.v3!.inCenter!), 'D26–30');
  assert.deepEqual(next.v3!.planned.map(packetLabel), ['D31–35', 'D36–40', 'D41–45', 'D46–50']);
  const count = db.operations!.assignments.length;
  synchronizePreparation(db, '2026-10-12');
  assert.equal(db.operations!.assignments.length, count);
  assert.throws(() => applyV3(db, command(db, v), teacher, now), /Explain a correction/);
});
test('one continuous roster sorts longest waiting, newer ready, newer departed (5–9,14)', () => {
  const db = fixture(),
    base = (id: string, at: string, done = false, out: string | null = null): Visit => ({
      id,
      studentId: db.students[0].id,
      arrivedAt: at,
      departedAt: out,
      ...(done
        ? {
            handoff: {
              at,
              actor: teacher.name,
              activities: {},
              assignmentIds: [],
              incoming: 'unknown' as const,
              events: [],
            },
          }
        : {}),
    });
  db.visits = [
    base('ready-old', '2026-10-12T19:00:00Z', true),
    base('wait-new', '2026-10-12T20:00:00Z'),
    base('left-old', '2026-10-12T17:00:00Z', false, '2026-10-12T18:00:00Z'),
    base('ready-new', '2026-10-12T20:30:00Z', true),
    base('wait-old', '2026-10-12T18:00:00Z'),
    base('left-new', '2026-10-12T18:30:00Z', false, '2026-10-12T19:00:00Z'),
  ];
  assert.deepEqual(
    dailyRoster(db, '2026-10-12').map((v) => v.id),
    ['wait-old', 'wait-new', 'ready-new', 'ready-old', 'left-new', 'left-old'],
  );
  assert.equal(db.visits[2].handoff, undefined);
});
test('Home groups present, still expected and departed without changing visits or repeat identities', () => {
  const db = fixture();
  db.students = db.students.slice(0, 6);
  for (const s of db.students) {
    db.operations!.students[s.id].visitDays = [1];
    s.earlyLearner = s.id === db.students[0].id;
  }
  db.students[4].name = 'Zoe Fictional';
  db.students[5].name = 'Amy Fictional';
  const visit = (index: number, id: string): Visit => ({
    id,
    studentId: db.students[index].id,
    arrivedAt: '2026-10-12T18:00:00Z',
    departedAt: null,
  });
  db.visits = [
    visit(0, 'waiting'),
    {
      ...visit(1, 'ready'),
      handoff: {
        at: now.toISOString(),
        actor: teacher.name,
        activities: {},
        assignmentIds: [],
        incoming: 'unknown',
        events: [],
      },
    },
    {
      ...visit(2, 'left'),
      departedAt: '2026-10-12T21:00:00Z',
      departureVerified: true,
    },
    {
      ...visit(3, 'auto'),
      closedAt: '2026-10-12T22:00:00Z',
      departureVerified: false,
    },
    {
      ...visit(0, 'earlier-visit'),
      arrivedAt: '2026-10-12T16:00:00Z',
      departedAt: '2026-10-12T17:00:00Z',
      departureVerified: true,
    },
  ];
  const before = structuredClone(db),
    home = homeRoster(db, '2026-10-12');
  assert.deepEqual(home.counts, { expected: 2, here: 2, early: 1, out: 2 });
  assert.deepEqual(
    home.rows.map((r) => r.visit?.id || r.student.name),
    ['waiting', 'ready', 'Amy Fictional', 'Zoe Fictional', 'auto', 'left', 'earlier-visit'],
  );
  assert.deepEqual(
    homeRoster(db, '2026-10-12', 'expected').rows.map((r) => r.student.name),
    ['Amy Fictional', 'Zoe Fictional'],
  );
  assert.deepEqual(
    homeRoster(db, '2026-10-12', 'here').rows.map((r) => r.visit!.id),
    ['waiting', 'ready'],
  );
  assert.deepEqual(
    homeRoster(db, '2026-10-12', 'early').rows.map((r) => r.visit!.id),
    ['waiting'],
  );
  assert.deepEqual(
    homeRoster(db, '2026-10-12', 'out').rows.map((r) => r.visit!.id),
    ['left', 'earlier-visit'],
  );
  assert.deepEqual(db, before);
});
test('Home Checked out requires explicit verification and uses departure date in the center timezone', () => {
  const db = fixture(),
    studentId = db.students[0].id;
  db.visits = [
    {
      id: 'overnight',
      studentId,
      arrivedAt: '2026-10-11T23:00:00Z',
      departedAt: '2026-10-12T07:00:00Z',
      departureVerified: true,
    },
    {
      id: 'late',
      studentId,
      arrivedAt: '2026-10-12T23:00:00Z',
      departedAt: '2026-10-13T06:59:59Z',
      departureVerified: true,
    },
    {
      id: 'tomorrow',
      studentId,
      arrivedAt: '2026-10-12T23:00:00Z',
      departedAt: '2026-10-13T07:00:00Z',
      departureVerified: true,
    },
    {
      id: 'unverified',
      studentId,
      arrivedAt: now.toISOString(),
      departedAt: now.toISOString(),
      departureVerified: false,
    },
    {
      id: 'legacy-unknown',
      studentId,
      arrivedAt: now.toISOString(),
      departedAt: now.toISOString(),
    },
    {
      id: 'auto',
      studentId,
      arrivedAt: now.toISOString(),
      departedAt: null,
      closedAt: now.toISOString(),
      departureVerified: false,
    },
  ];
  assert.deepEqual(
    homeRoster(db, '2026-10-12', 'out').rows.map((r) => r.visit!.id),
    ['late', 'overnight'],
  );
  assert.ok(homeRoster(db, '2026-10-12').rows.some((r) => r.visit?.id === 'overnight'));
  assert.deepEqual(
    homeRoster(db, '2026-10-13', 'out').rows.map((r) => r.visit!.id),
    ['tomorrow'],
  );
});
test('Home Still expected honors scheduling and does not duplicate a previous open visit', () => {
  const db = fixture();
  db.students = db.students.slice(0, 4);
  for (const s of db.students) db.operations!.students[s.id].visitDays = [1];
  db.operations!.students[db.students[1].id].active = false;
  db.operations!.students[db.students[2].id].awayUntil = '2026-10-19';
  db.visits = [
    {
      id: 'old-open',
      studentId: db.students[3].id,
      arrivedAt: '2026-10-11T20:00:00Z',
      departedAt: null,
    },
  ];
  assert.deepEqual(
    homeRoster(db, '2026-10-12', 'expected').rows.map((r) => r.student.id),
    [db.students[0].id],
  );
  assert.equal(homeRoster(db, '2026-10-12', 'here').counts.here, 1);
  db.operations!.center.closedDates.push('2026-10-12');
  assert.equal(homeRoster(db, '2026-10-12', 'expected').rows.length, 0);
});
test('early learners count actual presence, not assistance flags (10)', () => {
  const db = fixture();
  db.operations!.assistance = [];
  for (let i = 0; i < 6; i++) attendance(db, db.students[i].id, 'in', now);
  assert.equal(
    db.visits.filter(
      (v) => !v.departedAt && db.students.find((s) => s.id === v.studentId)?.earlyLearner,
    ).length,
    6,
  );
});
test('CONNECT-only handoff issues no invented physical work (11,22,23)', () => {
  const db = fixture();
  db.operations!.students[db.students[0].id].subjects.Math.format = 'CONNECT';
  const v = arrive(db);
  assert.equal(currentSets(db, v).length, 0);
  applyV3(db, command(db, v), teacher, now);
  assert.deepEqual(v.handoff!.assignmentIds, []);
  assert.equal(
    db.operations!.assignments.some((a) => a.studentId === v.studentId),
    false,
  );
});
test('auto-closure remains unverified and departed without handoff cannot confirm it (9,13,54)', () => {
  const db = fixture(),
    v = arrive(db);
  runDueJobs(db, new Date('2026-10-13T03:00:00Z'));
  assert.ok(v.closedAt);
  assert.equal(v.departedAt, null);
  assert.equal(measuredMinutes(v), null);
  assert.throws(() => applyV3(db, command(db, v), teacher, now), /departed/);
});
for (const [date, days, count, ppd] of [
  ['2026-10-12', 1, 1, 1],
  ['2026-10-14', 4, 4, 1],
  ['2026-10-15', 3, 6, 2],
] as const)
  test('calendar-day homework ' + date + ' has ' + count + ' packets (15–18)', () => {
    const db = fixture();
    if (date === '2026-10-15') db.operations!.students[db.students[0].id].visitDays = [1, 4];
    db.operations!.students[db.students[0].id].subjects.Math.packetsPerDay = ppd;
    const a = proposal(db, date);
    assert.equal(a.homeworkDays.length, days);
    assert.equal(a.v3!.planned.length, count);
    assert.equal(a.v3!.inCenter!.range.end - a.v3!.inCenter!.range.start + 1, 5);
  });
for (const size of [3, 5, 10])
  test(size + '-sheet packet identities and 3 separately identified packets/day (19–21)', () => {
    const db = fixture(),
      c = db.operations!.students[db.students[0].id].subjects.Math;
    c.sheetsPerPacket = size;
    c.packetsPerDay = 3;
    const a = proposal(db);
    assert.equal(a.v3!.planned.length, 3);
    assert.equal(new Set(a.v3!.planned.map((p) => p.id)).size, 3);
    assert.ok(a.v3!.planned.every((p) => p.range.end - p.range.start + 1 === size));
    assert.equal(a.v3!.planned[0].range.start, a.v3!.inCenter!.range.end + 1);
  });
test('mixed-mode paper planning is per subject and no CONNECT config is required (22,45,46)', () => {
  const db = fixture(),
    c = db.operations!.students[db.students[0].id];
  c.subjects.Reading.enrolled = true;
  c.subjects.Reading.format = 'CONNECT';
  assert.ok(paperProposal(db, db.students[0].id, 'Math', '2026-10-12', 'm'));
  assert.equal(paperProposal(db, db.students[0].id, 'Reading', '2026-10-12', 'r'), null);
  c.subjects.Math.format = 'CONNECT';
  assert.equal(proposal(db), null);
  c.subjects.Math.format = 'Paper';
  assert.ok(proposal(db));
});
test('regular weekdays reject Friday–Sunday and preserve original records (26)', () => {
  const db = fixture(),
    c = db.operations!.students[db.students[0].id];
  assert.equal(
    v3CommandInput.safeParse({
      action: 'student-save',
      studentId: db.students[0].id,
      name: 'Fictional Learner',
      earlyLearner: false,
      settings: c,
      enrollmentDate: null,
      visitDays: [5, 6, 0],
      tiles: [],
      goals: '',
      arrivalWindow: '',
    }).success,
    false,
  );
  assert.equal(expectedOn(db.operations!, db.students[0].id, '2026-10-16'), false);
});
test('Away Until pauses preparation and returns without vacation backlog (27,28)', () => {
  const db = fixture(),
    id = db.students[0].id;
  applyV3(db, { action: 'away', studentId: id, until: '2026-10-26' }, teacher, now);
  assert.equal(expectedOn(db.operations!, id, '2026-10-14'), false);
  assert.equal(paperProposal(db, id, 'Math', '2026-10-14', 'paused'), null);
  assert.equal(nextExpected(db.operations!, id, '2026-10-14'), '2026-10-26');
  const a = paperProposal(db, id, 'Math', '2026-10-26', 'returned')!;
  assert.equal(a.homeworkDays.length, 1);
  assert.equal(a.v3!.planned.length, 1);
  applyV3(db, { action: 'away', studentId: id, until: null }, teacher, now);
  assert.equal(expectedOn(db.operations!, id, '2026-10-14'), true);
});
test('corrections-only shifts C,H1,H2,H3 and holds H4 without new pull or completion (29–34,55)', () => {
  const db = fixture(),
    v = arrive(db);
  db.operations!.students[v.studentId].subjects.Math.nextStart = 16;
  synchronizePreparation(db, '2026-10-12');
  prepare(db, v);
  const a = currentSets(db, v)[0],
    r = recommend(a, 'Corrections only');
  assert.equal(r.out.length, a.v3!.planned.length);
  assert.equal(r.out[0].id, a.v3!.inCenter!.id);
  assert.ok(r.out.every((p) => p.prepared));
  assert.equal(r.held[0].id, a.v3!.planned.at(-1)!.id);
  applyV3(db, command(db, v, { activity: 'Corrections only' }), teacher, now);
  assert.equal(a.v3!.held.length, 1);
  assert.equal(db.operations!.classwork.length, 0);
  assert.equal(db.operations!.completions.length, 0);
  assert.equal(buildReport(db, 'monthly', '2026-10').officialSheets, 0);
});
for (const activity of ['Worksheets', 'Both'] as const)
  test(activity + ' activity never shifts or creates incompletion tracking (33,34)', () => {
    const db = fixture(),
      a = proposal(db);
    assert.deepEqual(recommend(a, activity).out, a.v3!.planned);
    assert.equal(recommend(a, activity).held.length, 0);
  });
test('two PAPER subjects have independent activities (29–33)', () => {
  const db = fixture(),
    c = db.operations!.students[db.students[0].id];
  c.subjects.Reading = { ...c.subjects.Math, enrolled: true, level: '4A' };
  const v = arrive(db);
  prepare(db, v);
  const cmd = command(db, v);
  cmd.subjects[0].activity = 'Corrections only';
  applyV3(db, cmd, teacher, now);
  const [math, reading] = currentSets(db, v);
  assert.equal(math.v3!.issued[0].id, math.v3!.inCenter!.id);
  assert.equal(reading.v3!.issued[0].id, reading.v3!.planned[0].id);
});
test('returned unfinished packets replace new slots; missing work is unavailable (35,36)', () => {
  const db = fixture(),
    a = proposal(db);
  const old = {
    ...a.v3!.planned[0],
    id: 'old-physical',
    range: { level: 'D', start: 1, end: 5 },
    status: 'unfinished' as const,
  };
  const r = recommend(a, 'Worksheets', [old]);
  assert.equal(r.out.length, a.v3!.planned.length);
  assert.equal(r.out[0].id, old.id);
  assert.equal(r.held.length, 1);
  assert.deepEqual(recommend(a, 'Worksheets', [{ ...old, status: 'missing' }]).out, a.v3!.planned);
});
test('zero outgoing slots and excess returns require explicit review (37)', () => {
  const db = fixture();
  db.operations!.students[db.students[0].id].subjects.Math.packetsPerDay = 0;
  const a = proposal(db);
  assert.match(recommend(a, 'Corrections only').review.join(' '), /No outgoing/);
});
test('one-time repeat leaves permanent cursor unchanged; restart records approved decision (38,39,51)', () => {
  for (const restart of [false, true]) {
    const db = fixture(),
      v = arrive(db);
    prepare(db, v);
    const original = db.operations!.students[v.studentId].subjects.Math.nextStart;
    applyV3(
      db,
      command(db, v, {
        repeat: { level: 'D', start: 1, restart },
        physicalConfirmed: true,
      }),
      teacher,
      now,
    );
    assert.equal(
      db.operations!.students[v.studentId].subjects.Math.nextStart,
      restart ? 6 : original,
    );
    assert.equal(db.operations!.decisions.at(-1)!.kind, restart ? 'repeat-from' : 'repeat-range');
    assert.ok(db.operations!.decisions.at(-1)!.approvedAt);
  }
});
test('manual exact overrides win, retain packet defaults and next actual sequence (40)', () => {
  const db = fixture(),
    v = arrive(db);
  prepare(db, v);
  const a = currentSets(db, v)[0],
    cfg = db.operations!.students[v.studentId].subjects.Math;
  applyV3(
    db,
    command(db, v, {
      actual: [
        {
          ...a.v3!.planned[0],
          id: 'manual-physical',
          range: { level: 'D', start: 50, end: 54 },
          prepared: false,
        },
      ],
      physicalConfirmed: true,
      reason: 'Instructor chose this physical packet',
    }),
    teacher,
    now,
  );
  assert.equal(a.v3!.issued[0].range.start, 50);
  assert.equal(cfg.nextStart, 55);
  assert.equal(cfg.packetsPerDay, 1);
  assert.equal(cfg.sheetsPerPacket, 5);
});
test('new material is never falsely prepared; duplicate physical identities rejected (40,41)', () => {
  const db = fixture(),
    v = arrive(db);
  prepare(db, v);
  const a = currentSets(db, v)[0],
    p = {
      ...a.v3!.planned[0],
      id: 'new-material',
      range: { level: 'D', start: 80, end: 84 },
      prepared: false,
    };
  assert.throws(
    () => applyV3(db, command(db, v, { actual: [p] }), teacher, now),
    /physical material/,
  );
  assert.throws(
    () => applyV3(db, command(db, v, { actual: [p, p], physicalConfirmed: true }), teacher, now),
    /Duplicate worksheets/,
  );
});
test('prepared set settings changes retain physical identities and require adjustment (41)', () => {
  const db = fixture(),
    v = arrive(db);
  prepare(db, v);
  const a = currentSets(db, v)[0],
    before = structuredClone(a.v3!.planned);
  db.operations!.students[v.studentId].subjects.Math.sheetsPerPacket = 3;
  synchronizePreparation(db, '2026-10-12');
  assert.equal(a.stale, true);
  assert.deepEqual(a.v3!.planned, before);
  assert.match(a.v3!.adjustment.join(' '), /reprepare/);
});
test('unknown catalog and level boundary stop before nonexistent worksheets (42,43)', () => {
  const db = fixture(),
    c = db.operations!.students[db.students[0].id].subjects.Math;
  c.nextStart = 199;
  const a = proposal(db);
  assert.equal(a.v3!.inCenter, null);
  assert.equal(a.v3!.planned.length, 0);
  assert.match(a.blocked.join(' '), /Assessment/);
  assert.match(validateRange(db, 'Reading', { level: 'A', start: 1, end: 5 })!, /no approved/);
  assert.equal(
    db.operations!.v3!.catalog.find((l) => l.subject === 'Reading' && l.id === 'AI')!.order + 1,
    db.operations!.v3!.catalog.find((l) => l.subject === 'Reading' && l.id === 'AII')!.order,
  );
});
test('temporary physical CONNECT fallback keeps mode and preserves history (22,45,46)', () => {
  const db = fixture(),
    cfg = db.operations!.students[db.students[0].id];
  cfg.subjects.Math.format = 'CONNECT';
  const v = arrive(db);
  applyV3(
    db,
    {
      action: 'temporary-paper',
      visitId: v.id,
      subject: 'Math',
      range: { level: 'D', start: 1, end: 5 },
    },
    teacher,
    now,
  );
  const a = currentSets(db, v)[0];
  assert.equal(a.v3!.temporaryPaper, true);
  assert.equal(cfg.subjects.Math.format, 'CONNECT');
  prepare(db, v);
  applyV3(db, command(db, v), teacher, now);
  assert.equal(a.v3!.issued.length, 1);
  assert.equal(cfg.subjects.Math.format, 'CONNECT');
});
test('medals and combined format+subject filters match same subject (47,57,58)', () => {
  const db = fixture(),
    s = db.students[0],
    c = db.operations!.students[s.id];
  c.subjects.Math.format = 'CONNECT';
  c.subjects.Reading = { ...c.subjects.Math, enrolled: true, format: 'Paper' };
  db.operations!.achievements.push({
    id: 'gold',
    studentId: s.id,
    subject: 'Reading',
    distinction: 'Gold',
    date: '2026-10-12',
    evidence: 'Fictional approved medal',
    verifiedBy: teacher.name,
    createdAt: now.toISOString(),
  });
  assert.equal(
    filterRoster(db, {
      ...filter,
      query: s.name,
      subject: 'Math',
      format: 'Paper',
    }).length,
    0,
  );
  assert.equal(
    filterRoster(db, {
      ...filter,
      query: s.name,
      subject: 'Reading',
      format: 'Paper',
      medal: 'Gold',
    }).length,
    1,
  );
  assert.equal(
    filterRoster(db, {
      ...filter,
      query: s.name,
      subject: 'Math',
      medal: 'Gold',
    }).length,
    0,
  );
  assert.equal(filterRoster(db, { ...filter, query: s.name, days: [2] }).length, 0);
  assert.equal(filterRoster(db, { ...filter, query: s.name, days: [1], early: true }).length, 1);
});
for (const { name, subject, format, medal, expected } of [
  {
    name: 'rejects cross-subject format/medal matches',
    subject: 'All',
    format: 'CONNECT',
    medal: 'Gold',
    expected: 0,
  },
  {
    name: 'accepts same-subject format/medal matches',
    subject: 'All',
    format: 'Paper',
    medal: 'Gold',
    expected: 1,
  },
  {
    name: 'preserves explicit-subject medal exclusion',
    subject: 'Math',
    format: 'CONNECT',
    medal: 'Gold',
    expected: 0,
  },
  {
    name: 'preserves explicit-subject medal matches',
    subject: 'Reading',
    format: 'Paper',
    medal: 'Gold',
    expected: 1,
  },
  {
    name: 'preserves CONNECT matches without a medal filter',
    subject: 'All',
    format: 'CONNECT',
    medal: 'All',
    expected: 1,
  },
  {
    name: 'preserves PAPER matches without a medal filter',
    subject: 'All',
    format: 'Paper',
    medal: 'All',
    expected: 1,
  },
  {
    name: 'preserves explicit-subject format exclusion without a medal filter',
    subject: 'Math',
    format: 'Paper',
    medal: 'All',
    expected: 0,
  },
  {
    name: 'preserves medal matches without a format filter',
    subject: 'All',
    format: 'All',
    medal: 'Gold',
    expected: 1,
  },
  {
    name: 'preserves None medal exclusion across all subjects',
    subject: 'All',
    format: 'CONNECT',
    medal: 'None',
    expected: 0,
  },
  {
    name: 'preserves explicit-subject None medal matches',
    subject: 'Math',
    format: 'CONNECT',
    medal: 'None',
    expected: 1,
  },
]) {
  test('roster filtering ' + name, () => {
    const db = fixture(),
      student = db.students[0],
      settings = db.operations!.students[student.id];
    settings.subjects.Math.format = 'CONNECT';
    settings.subjects.Reading = {
      ...settings.subjects.Math,
      enrolled: true,
      format: 'Paper',
    };
    db.operations!.achievements.push({
      id: 'reading-gold',
      studentId: student.id,
      subject: 'Reading',
      distinction: 'Gold',
      date: '2026-10-12',
      evidence: 'Fictional approved medal',
      verifiedBy: teacher.name,
      createdAt: now.toISOString(),
    });
    assert.deepEqual(
      filterRoster(db, {
        ...filter,
        query: student.name,
        subject,
        format,
        medal,
      }).map((s) => s.id),
      expected ? [student.id] : [],
    );
  });
}
test('profile edit sets early learner, enrollment, modes and shorts in one command (48)', () => {
  const db = fixture(),
    s = db.students[0],
    cfg = structuredClone(db.operations!.students[s.id]);
  applyV3(
    db,
    {
      action: 'student-save',
      studentId: s.id,
      name: s.name,
      earlyLearner: false,
      settings: cfg,
      enrollmentDate: '2026-01-01',
      visitDays: [2, 4],
      tiles: ['Focused well'],
      goals: 'Fictional goal',
      arrivalWindow: '14:00',
    },
    teacher,
    now,
  );
  assert.equal(s.earlyLearner, false);
  assert.deepEqual(db.operations!.students[s.id].visitDays, [2, 4]);
  assert.equal(db.operations!.students[s.id].enrollmentDate, '2026-01-01');
});
test('optional school grade saves, preserves omitted values and history, and can be cleared explicitly', () => {
  const db = fixture(),
    s = db.students[0];
  const command = (grade?: string | null) => {
    const settings = structuredClone(db.operations!.students[s.id]);
    delete settings.grade;
    if (grade !== undefined) settings.grade = grade;
    return {
      action: 'student-save',
      studentId: s.id,
      name: s.name,
      earlyLearner: s.earlyLearner,
      settings,
      enrollmentDate: null,
      visitDays: [1, 3],
      tiles: [],
      goals: '',
      arrivalWindow: '',
    };
  };
  assert.equal(db.operations!.students[s.id].grade, undefined);
  applyV3(db, v3CommandInput.parse(command(' Grade 3 ')), teacher, now);
  assert.equal(db.operations!.students[s.id].grade, 'Grade 3');
  const history = structuredClone(db.operations!.configHistory);
  assert.equal(history.at(-1)!.settings!.grade, 'Grade 3');
  applyV3(db, v3CommandInput.parse(command()), teacher, now);
  assert.equal(db.operations!.students[s.id].grade, 'Grade 3');
  assert.deepEqual(db.operations!.configHistory.slice(0, history.length), history);
  assert.equal(v3CommandInput.safeParse(command('x'.repeat(41))).success, false);
  applyV3(db, v3CommandInput.parse(command(null)), teacher, now);
  assert.equal(db.operations!.students[s.id].grade, null);
  assert.equal(history.at(-1)!.settings!.grade, 'Grade 3');
});

test('profile status saves preserve history and reject unenrollment during an open visit', () => {
  const db = fixture(),
    s = db.students[0];
  const saveStatus = (active: boolean) =>
    applyV3(
      db,
      {
        action: 'student-save',
        studentId: s.id,
        name: s.name,
        earlyLearner: s.earlyLearner,
        settings: { ...structuredClone(db.operations!.students[s.id]), active },
        enrollmentDate: null,
        visitDays: [1, 3],
        tiles: [],
        goals: '',
        arrivalWindow: '',
      },
      teacher,
      now,
    );
  saveStatus(false);
  assert.equal(db.operations!.students[s.id].active, false);
  assert.equal(db.operations!.configHistory.at(-1)!.settings!.active, false);
  saveStatus(true);
  assert.equal(db.operations!.students[s.id].active, true);
  arrive(db);
  const before = structuredClone(db);
  assert.throws(() => saveStatus(false), /Reconcile the open attendance visit/);
  assert.deepEqual(db, before);
});

test('visit timeline matches unique legacy dates, preserves ambiguous multiple sessions (49,50,14)', () => {
  const db = fixture(),
    id = db.students[0].id;
  db.visits = [
    {
      id: 'first',
      studentId: id,
      arrivedAt: '2026-10-12T18:00:00Z',
      departedAt: '2026-10-12T19:00:00Z',
    },
    {
      id: 'second',
      studentId: id,
      arrivedAt: '2026-10-12T21:00:00Z',
      departedAt: '2026-10-12T22:00:00Z',
    },
  ];
  assert.equal(matchVisit(db, id, '2026-10-12T18:30:00Z')!.id, 'first');
  assert.equal(matchVisit(db, id, '2026-10-12T20:00:00Z'), null);
  assert.equal(matchVisit(db, id, '2026-10-12T23:00:00Z', 'second')!.id, 'second');
});
test('attendance measurements and source emptiness never fabricate academic data (52–56)', () => {
  const db = fixture(),
    v = arrive(db);
  assert.equal(measuredMinutes(v), null);
  attendance(db, v.studentId, 'out', new Date(now.getTime() + 30 * 60000));
  assert.equal(measuredMinutes(v), 30);
  assert.equal(db.operations!.completions.length, 0);
  assert.equal(buildReport(db, 'monthly', '2026-10').physicalSheets, 0);
});
test('arrivals and weighted occupancy differ; unresolved historical visits excluded (59)', () => {
  const db = fixture(),
    id = db.students[0].id;
  db.visits = [
    {
      id: 'a',
      studentId: id,
      arrivedAt: '2026-10-12T20:00:00Z',
      departedAt: '2026-10-12T20:30:00Z',
      departureVerified: true,
    },
    {
      id: 'b',
      studentId: id,
      arrivedAt: '2026-10-12T20:30:00Z',
      departedAt: '2026-10-12T21:00:00Z',
      departureVerified: true,
    },
    {
      id: 'c',
      studentId: id,
      arrivedAt: '2026-10-12T20:00:00Z',
      departedAt: null,
      closedAt: '2026-10-12T23:00:00Z',
      departureVerified: false,
    },
  ];
  const a = centerActivity(db, '2026-10-12', '2026-10-12', null, new Date('2026-10-13T20:00:00Z'));
  assert.equal(a.bins[13].arrivals, 3);
  assert.equal(a.bins[13].occupancy, 1);
  assert.equal(a.excluded, 1);
});
test('assistant cannot confirm handoff or record notes, catalog is owner-only', () => {
  const db = fixture(),
    v = arrive(db);
  assert.throws(
    () => applyV3(db, command(db, v), { name: 'Assistant', role: 'assistant' }, now),
    /instructor/,
  );
  assert.throws(
    () =>
      applyV3(
        db,
        {
          action: 'catalog',
          subject: 'Reading',
          id: 'AI',
          first: 1,
          last: 150,
          order: 6,
          source: 'Fictional verified example',
        },
        teacher,
        now,
      ),
    /owner/,
  );
  applyV3(
    db,
    {
      action: 'catalog',
      subject: 'Reading',
      id: 'AI',
      first: 1,
      last: 150,
      order: 6,
      source: 'Fictional verified example',
    },
    owner,
    now,
  );
  assert.equal(validateRange(db, 'Reading', { level: 'AI', start: 146, end: 150 }), null);
});
test('reopened visit notes do not require second instructional check-in', () => {
  const db = fixture(),
    v = arrive(db);
  prepare(db, v);
  applyV3(db, command(db, v), teacher, now);
  const at = v.handoff!.at,
    count = db.operations!.assignments.length;
  attendance(db, v.studentId, 'out', new Date(now.getTime() + 3600000));
  applyV3(
    db,
    {
      action: 'observation',
      visitId: v.id,
      choices: ['Worked independently'],
      text: 'Fictional after-visit note',
      followUp: false,
    },
    teacher,
    now,
  );
  assert.equal(v.handoff!.at, at);
  assert.equal(db.operations!.assignments.length, count);
  assert.equal(db.observations.at(-1)!.visitId, v.id);
});
test('existing V2 reviewed notes, achievement and attendance reversal still work', () => {
  const db = fixture(),
    v = arrive(db);
  applyV2(
    db,
    {
      action: 'achievement',
      studentId: v.studentId,
      subject: 'Math',
      distinction: 'Silver',
      date: '2026-10-12',
      evidence: 'Fictional verified record',
    },
    teacher,
    now,
  );
  attendance(db, v.studentId, 'out', new Date(now.getTime() + 30000));
  applyV2(
    db,
    {
      action: 'visit-reconcile',
      id: v.id,
      mode: 'reopen',
      reason: 'Fictional accidental checkout',
    },
    teacher,
    now,
  );
  assert.equal(v.departedAt, null);
  assert.equal(db.operations!.achievements.length, 1);
});
test('returned unfinished versus missing packets persist through an actual next handoff', () => {
  for (const state of ['unfinished', 'missing'] as const) {
    const db = fixture(),
      first = arrive(db);
    prepare(db, first);
    applyV3(db, command(db, first), teacher, now);
    const old = currentSets(db, first)[0].v3!.issued[0];
    attendance(db, first.studentId, 'out', new Date('2026-10-12T21:00:00Z'));
    attendance(db, first.studentId, 'in', new Date('2026-10-14T20:00:00Z'));
    const second = db.visits.at(-1)!;
    synchronizePreparation(db, '2026-10-14');
    prepare(db, second);
    const a = currentSets(db, second)[0];
    applyV3(
      db,
      command(db, second, {
        exception: true,
        incoming: [{ id: old.id, state }],
      }),
      teacher,
      new Date('2026-10-14T20:05:00Z'),
    );
    assert.equal(a.v3!.issued.length, 4);
    assert.equal(
      a.v3!.issued.some((p) => p.id === old.id),
      state === 'unfinished',
    );
    assert.equal(db.operations!.completions.length, 0);
    if (state === 'missing')
      assert.ok(
        incomingPackets(db, second.studentId, 'Math').some(
          (p) => p.id === old.id && p.status === 'missing',
        ),
      );
    else {
      const next = db.operations!.assignments.find(
        (a) =>
          a.v3?.visitDate === '2026-10-19' &&
          a.studentId === first.studentId &&
          a.subject === 'Math',
      )!;
      assert.equal(next.v3!.inCenter!.prepared, true);
      assert.equal(next.v3!.inCenter!.id, a.v3!.held[0].id);
    }
  }
});
test('catalog approval refreshes a blocked proposal without duplicate preparation', () => {
  const db = fixture(),
    id = db.students[0].id;
  db.operations!.students[id].subjects.Math.level = 'G';
  synchronizePreparation(db, '2026-10-12');
  const a = db.operations!.assignments.find((a) => a.studentId === id && a.v3)!;
  assert.ok(a.v3!.review.length);
  applyV3(
    db,
    {
      action: 'catalog',
      subject: 'Math',
      id: 'G',
      first: 1,
      last: 150,
      order: 11,
      source: 'Fictional center reviewed boundary',
    },
    owner,
    now,
  );
  assert.equal(a.id, db.operations!.assignments.find((a) => a.studentId === id && a.v3)!.id);
  assert.equal(a.v3!.review.length, 0);
  assert.equal(a.v3!.planned.length, 1);
});
test('non-recurring Away Until return is an expected visit; weekends are rejected', () => {
  const db = fixture(),
    id = db.students[0].id;
  applyV3(db, { action: 'away', studentId: id, until: '2026-10-15' }, teacher, now);
  assert.equal(expectedOn(db.operations!, id, '2026-10-14'), false);
  assert.equal(expectedOn(db.operations!, id, '2026-10-15'), true);
  assert.equal(expectedOn(db.operations!, id, '2026-10-16'), false);
  assert.throws(
    () => applyV3(db, { action: 'away', studentId: id, until: '2026-10-17' }, teacher, now),
    /Monday/,
  );
});
test('confirmed exact V2 paper work informs V3 initial sequence without changing its history', () => {
  const db = fixture(),
    a = proposal(db);
  a.v3 = undefined;
  a.status = 'distributed';
  a.ranges = [{ level: 'D', start: 21, end: 25 }];
  a.updatedAt = now.toISOString();
  const next = paperProposal(db, a.studentId, 'Math', '2026-10-14', 'next')!;
  assert.equal(next.v3!.inCenter!.range.start, 26);
  assert.deepEqual(a.ranges, [{ level: 'D', start: 21, end: 25 }]);
});
test('occupancy uses actual spring/fall DST hours and spans verified midnight visits', () => {
  const db = fixture(),
    id = db.students[0].id;
  db.visits = [
    {
      id: 'spring',
      studentId: id,
      arrivedAt: '2026-03-08T09:30:00Z',
      departedAt: '2026-03-08T10:30:00Z',
    },
    {
      id: 'fall',
      studentId: id,
      arrivedAt: '2026-11-01T08:00:00Z',
      departedAt: '2026-11-01T10:00:00Z',
    },
    {
      id: 'midnight',
      studentId: id,
      arrivedAt: '2026-10-12T06:30:00Z',
      departedAt: '2026-10-12T07:30:00Z',
    },
  ];
  const spring = centerActivity(db, '2026-03-08', '2026-03-08');
  assert.equal(spring.bins[1].occupancy, 0.5);
  assert.equal(spring.bins[2].occupancy, 0);
  assert.equal(spring.bins[3].occupancy, 0.5);
  assert.equal(centerActivity(db, '2026-11-01', '2026-11-01').bins[1].occupancy, 1);
  const midnight = centerActivity(db, '2026-10-12', '2026-10-12');
  assert.equal(midnight.bins[0].arrivals, 0);
  assert.equal(midnight.bins[0].occupancy, 0.5);
});
test('switching a waiting PAPER subject to CONNECT hides its old physical set without deleting it', () => {
  const db = fixture(),
    v = arrive(db),
    a = currentSets(db, v)[0];
  db.operations!.students[v.studentId].subjects.Math.format = 'CONNECT';
  assert.equal(currentSets(db, v).length, 0);
  assert.ok(db.operations!.assignments.some((p) => p.id === a.id));
  applyV3(db, command(db, v), teacher, now);
  assert.deepEqual(v.handoff!.assignmentIds, []);
});
