import { expect, type Locator, type Page } from '@playwright/test';
import type { Snapshot, Visit } from '../../src/lib/model';
import type { V2Command } from '../../src/lib/v2-domain';
import type { V3Command } from '../../src/lib/v3-domain';
import { repository } from '../../src/lib/repository';
import { runDueJobs } from '../../src/lib/reports';
import { zonedTimestamp, addDays, localClock } from '../../src/lib/schedule';
import path from 'node:path';
import { currentSets, incomingPackets } from '../../src/lib/v3-planning';
import { dayKey } from '../../src/lib/model';
/** Assert geometry in the final state, rather than halfway through dialog entry. */
export async function settleDialog(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))),
  );
}
let nextLogin = 0;
export async function login(page: Page, role = 'owner') {
  // Exercise real authentication without a fast suite exhausting its unchanged
  // 20-attempt/minute server protection. Reserve slots before concurrent calls.
  const wait = Math.max(0, nextLogin - Date.now());
  nextLogin = Date.now() + wait + 3500;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  await page.goto('/login');
  await page.getByLabel('Email address').fill(role + '@demo.center');
  await page
    .getByLabel('Password', { exact: true })
    .fill(
      role === 'assistant'
        ? 'HelpDemo!2026'
        : role === 'instructor'
          ? 'TeachDemo!2026'
          : 'CenterDemo!2026',
    );
  await page.getByRole('button', { name: 'Sign in to your center' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
}
export async function state(page: Page): Promise<Snapshot> {
  return await (await page.request.get('/api/state')).json();
}
export async function command(page: Page, kind: 'v2' | 'v3', command: V2Command | V3Command) {
  const r = await page.request.post('/api/commands', {
    headers: { Origin: new URL(page.url()).origin },
    data: { kind, command, requestId: crypto.randomUUID() },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return (await r.json()).id as string;
}
export async function physical(page: Page, studentId: string, direction: 'in' | 'out') {
  const r = await page.request.post('/api/commands', {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      kind: 'attendance',
      studentId,
      direction,
      requestId: crypto.randomUUID(),
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
}
export async function learner(page: Page, format: 'Paper' | 'CONNECT' = 'Paper') {
  const name = 'Fictional V3 Learner ' + Date.now() + ' ' + Math.random().toString(36).slice(2, 5),
    id = await command(page, 'v2', {
      action: 'student-add',
      name,
      earlyLearner: true,
    });
  const db = await state(page),
    cfg = structuredClone(db.operations!.students[id]);
  cfg.subjects.Math = {
    ...cfg.subjects.Math,
    enrolled: true,
    format,
    level: 'D',
    nextStart: 16,
    packetsPerDay: 1,
    sheetsPerPacket: 5,
  };
  cfg.subjects.Reading.enrolled = false;
  await command(page, 'v3', {
    action: 'student-save',
    studentId: id,
    name,
    earlyLearner: true,
    settings: cfg,
    enrollmentDate: '2026-01-01',
    // Tests exercising outgoing packets need at least one day before the next
    // visit, including when this suite runs on Tuesday or Sunday.
    visitDays: [1, 3].filter(
      (day) =>
        day !== (new Date(dayKey(new Date(), db.timezone) + 'T12:00:00Z').getUTCDay() + 1) % 7,
    ),
    tiles: [],
    goals: 'Fictional independent work goal',
    arrivalWindow: '',
  });
  return { id, name };
}
export async function arrive(page: Page, id: string): Promise<Visit> {
  await physical(page, id, 'in');
  return (await state(page)).visits
    .filter((v) => v.studentId === id && !v.departedAt && !v.closedAt)
    .at(-1)!;
}
export async function prepare(page: Page, id: string) {
  const db = await state(page);
  for (const a of db.operations!.assignments.filter(
    (a) =>
      a.studentId === id &&
      a.v3 &&
      !a.v3.issuedAt &&
      (a.v3.temporaryPaper ||
        (db.operations!.students[id].subjects[a.subject].enrolled &&
          db.operations!.students[id].subjects[a.subject].format === 'Paper')),
  ))
    await command(page, 'v3', {
      action: 'prepare',
      ids: [a.id],
      versions: { [a.id]: a.v3!.version },
      reprepare: Boolean(a.stale),
    });
}
export async function openProfile(page: Page, name: string) {
  await page.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await page.getByLabel('Search Student Roster').fill(name);
  await page.locator('.roster-v3-person').filter({ hasText: name }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
export async function handoff(page: Page, visit: Visit) {
  let db = await state(page);
  let sets = currentSets(db, visit);
  // Reused synthetic learners can have a forecast from an earlier run.
  // Pull the now-current set explicitly rather than waive physical review.
  for (const a of sets.filter((a) => a.stale))
    await command(page, 'v3', {
      action: 'prepare',
      ids: [a.id],
      versions: { [a.id]: a.v3!.version },
      reprepare: true,
    });
  db = await state(page);
  sets = currentSets(db, visit);
  expect(sets.every((a) => !a.stale && a.v3!.preparedAt)).toBe(true);
  await command(page, 'v3', {
    action: 'handoff',
    visitId: visit.id,
    expectedAt: null,
    subjects: sets.map((a) => ({
      subject: a.subject,
      assignmentId: a.id,
      version: a.v3!.version,
      activity: 'Worksheets',
      // Reconcile earlier synthetic cycles explicitly; keep their receipt history.
      exception: true,
      incoming: incomingPackets(db, visit.studentId, a.subject)
        .filter((p) => p.sourceAssignmentId !== a.id)
        .map((p) => ({ id: p.id, state: 'finished' as const })),
      actual: null,
      repeat: null,
      physicalConfirmed: false,
      reason: 'Fictional scenario setup: instructor received previous test-cycle packets',
    })),
    choices: [],
    text: '',
    followUp: false,
    correctionReason: '',
  });
}
export async function simulatedClosure(visitId: string, date: string) {
  const env = { ...process.env };
  process.env.DEMO_DATA_PATH = path.resolve(
    process.env.ARITHMETICA_E2E_DATA_PATH ||
      process.env.CENTERFLOW_E2E_DATA_PATH ||
      'data/e2e-v3.json',
  );
  process.env.DATA_ADAPTER = 'local';
  process.env.DEMO_MODE = 'true';
  try {
    await repository.transaction((db) => {
      const v = db.visits.find((v) => v.id === visitId)!;
      if (!v) throw Error('Fictional visit missing');
      const simulated = structuredClone(db);
      simulated.visits = simulated.visits.filter((v) => v.id === visitId);
      const afterHours =
        localClock(new Date(v.arrivedAt), db.operations!.center.timezone) >=
        db.operations!.center.closingTime;
      const stamp = zonedTimestamp(
        afterHours ? addDays(date, 1) : date,
        afterHours ? '00:01' : '19:16',
        db.operations!.center.timezone,
      );
      runDueJobs(simulated, new Date(stamp));
      Object.assign(v, simulated.visits[0]);
      db.audit.push(
        ...simulated.audit.filter(
          (a) =>
            a.entityId === visitId &&
            a.action === 'visit:unverified-auto-closure' &&
            a.at === stamp,
        ),
      );
    });
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
}
