import { test, expect } from '@playwright/test';
import {
  login,
  state,
  command,
  learner,
  arrive,
  prepare,
  openProfile,
  physical,
  handoff,
  simulatedClosure,
} from './helpers';
import { dayKey } from '../../src/lib/model';
test('Home has three metrics, direct waiting Quick View and only the V3 navigation', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page, 'CONNECT'),
    v = await arrive(page, s.id);
  await page.reload();
  await expect(page.locator('.home-v3-metrics>div')).toHaveCount(3);
  await expect(page.getByLabel('Global student or family search')).toHaveCount(0);
  for (const name of ['Corrections', 'Calendar', 'Review queue', 'Attendance'])
    await expect(page.locator('.sidebar').getByRole('button', { name, exact: true })).toHaveCount(
      0,
    );
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.locator('[data-visit-id="' + v.id + '"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await state(page)).visits.find((x) => x.id === v.id)!.handoff).toBeUndefined();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await page.getByRole('link', { name: 'Centerflow home' }).click();
  await expect(page.getByRole('heading', { name: 'Your center, right now.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.screenshot({ path: 'test-results/v3-home.png' });
});
test('roster creates, consolidated edit sets defaults, withdrawal/reactivation and QR preserve identity', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await page.getByRole('button', { name: 'Add student', exact: true }).click();
  const name = 'Fictional V3 Edit ' + Date.now();
  await page.getByLabel('New fictional student name').fill(name);
  await page.getByRole('button', { name: 'Create student' }).click();
  await page.locator('.roster-v3-person').filter({ hasText: name }).click();
  await page.getByRole('button', { name: 'Edit Student', exact: true }).click();
  await page.getByLabel('Enrollment date', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Math worksheets per packet').fill('3');
  await page.getByLabel('Early learner', { exact: true }).check();
  await page.getByRole('button', { name: 'Save Student', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.overview-v3')).toContainText('3 worksheets / packet');
  await page.getByRole('button', { name: 'Withdraw student' }).click();
  await expect(page.getByRole('button', { name: 'Reactivate student' })).toBeVisible();
  await page.getByRole('button', { name: 'Reactivate student' }).click();
  const db = await state(page),
    s = db.students.find((s) => s.name === name)!;
  await page.getByRole('button', { name: 'Show pouch QR' }).click();
  await page.getByRole('button', { name: 'Reissue QR identifier' }).click();
  expect((await state(page)).students.find((x) => x.id === s.id)!.token).not.toBe(s.token);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No recorded academic milestones' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/v3-profile.png' });
});
test('compact preparation shows every packet, supports partial subject readiness and prepared is never issued', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page),
    db = await state(page),
    cfg = structuredClone(db.operations!.students[s.id]);
  cfg.subjects.Reading = {
    ...cfg.subjects.Math,
    enrolled: true,
    level: '4A',
    packetsPerDay: 1,
    sheetsPerPacket: 3,
  };
  await command(page, 'v3', {
    action: 'student-save',
    studentId: s.id,
    name: s.name,
    earlyLearner: true,
    settings: cfg,
    enrollmentDate: '2026-01-01',
    visitDays: [1, 3],
    tiles: [],
    goals: '',
    arrivalWindow: '',
  });
  await page.getByRole('button', { name: /^Homework Preparation/ }).click();
  await page.getByLabel('Search preparation').fill(s.name);
  const card = page.locator('[data-preparation-student="' + s.id + '"]');
  await expect(card).toContainText('IN CENTER');
  await expect(card).toContainText('TAKE HOME');
  expect(await card.locator('.packet-chip').count()).toBeGreaterThan(2);
  expect(await card.locator('details').count()).toBe(0);
  await card.getByRole('button', { name: 'Mark Math prepared' }).click();
  await expect(card).toContainText('Prepared');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Mark Prepared', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: /^Prepared/ }).click();
  await expect(page.locator('.prep-entry').filter({ hasText: s.name })).toBeVisible();
  expect(
    (await state(page))
      .operations!.assignments.filter((a) => a.studentId === s.id && a.v3)
      .every((a) => a.v3!.issuedAt === null),
  ).toBe(true);
  await page.getByRole('button', { name: /^Needs Preparation/ }).click();
  await page.getByLabel('Search preparation').fill('');
  await page.screenshot({ path: 'test-results/v3-preparation.png' });
});
test('Quick View corrections-only, one-time repeat and manual overrides record actual packets and preserve defaults', async ({
  page,
}) => {
  await login(page);
  for (const mode of ['shift', 'repeat', 'manual']) {
    const s = await learner(page),
      v = await arrive(page, s.id);
    await prepare(page, s.id);
    await page.reload();
    await page.locator('[data-visit-id="' + v.id + '"]').click();
    const d = page.getByRole('dialog');
    if (mode === 'shift') {
      await d.getByRole('button', { name: 'Corrections only', exact: true }).click();
      await expect(d.locator('.physical-instruction')).toContainText('keep');
    } else {
      await d.getByRole('button', { name: 'Adjust / Repeat' }).click();
      if (mode === 'repeat') {
        await d.getByLabel('Repeat from worksheet', { exact: true }).check();
        await d.getByLabel('Repeat starting worksheet').fill('1');
      } else {
        await d.getByLabel('Math packet 1 start').fill('80');
        await d.getByLabel('Math packet 1 end').fill('84');
        await d.getByLabel('Adjustment reason').fill('Fictional instructor override');
      }
      await d.getByLabel('Physical materials adjusted and ready to hand over').check();
    }
    await d.getByRole('button', { name: 'Complete instructor check-in' }).click();
    await expect(d).toHaveCount(0);
    await expect(page.locator('[data-visit-id="' + v.id + '"]')).toHaveClass(/ready/);
    const latest = await state(page),
      a = latest.operations!.assignments.find((a) => a.v3?.visitId === v.id)!;
    expect(a.v3!.issued.length).toBe(a.targetPackets);
    expect(latest.operations!.completions.length).toBe(0);
    if (mode === 'shift') {
      expect(a.v3!.held.length).toBe(1);
      expect(a.v3!.issued[0].id).toBe(a.v3!.inCenter!.id);
    }
    if (mode === 'repeat') {
      expect(a.v3!.issued[0].range.start).toBe(1);
      expect(latest.operations!.students[s.id].subjects.Math.nextStart).toBe(16);
    }
    if (mode === 'manual') expect(a.v3!.issued[0].range.start).toBe(80);
    await page.locator('[data-visit-id="' + v.id + '"]').click();
    await expect(d.getByRole('button', { name: 'Complete instructor check-in' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
});
test('Center Activity separates arrivals and occupancy, and removed appointment records remain in state', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page, 'CONNECT');
  await arrive(page, s.id);
  await physical(page, s.id, 'out');
  await page.getByRole('button', { name: 'Center Activity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Student check-ins by hour' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Average simultaneous occupancy by hour' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Weekly', exact: true }).click();
  await page.getByLabel('Weekday comparison').selectOption('3');
  await expect(page.locator('.chart-card')).toHaveCount(2);
  expect(Array.isArray((await state(page)).operations!.appointments)).toBe(true);
  await page.screenshot({ path: 'test-results/v3-activity.png' });
});
test('daily weekly monthly report exports and immutable revisions remain functional', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await page.getByLabel('Period date').fill('2026-10-14');
  for (const type of ['Daily', 'Weekly', 'Monthly']) {
    await page.getByRole('button', { name: type, exact: true }).click();
    await page.getByRole('button', { name: 'Generate / open snapshot' }).click();
    await expect(page.locator('.report-detail')).toContainText(type + ' report');
  }
  const href = await page.getByRole('link', { name: 'CSV', exact: true }).getAttribute('href');
  const csv = await page.request.get(href!);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain('Official completed count');
  await page.getByText('Historical snapshot revisions', { exact: true }).click();
  await page.getByLabel('Create a new version; preserve the earlier snapshot').check();
  const previous = Math.max(
    ...(await state(page))
      .operations!.reports.filter((r) => r.kind === 'monthly' && r.period === '2026-10')
      .map((r) => r.version),
  );
  await page.getByRole('button', { name: 'Generate / open snapshot' }).click();
  await expect(page.locator('.report-detail')).toContainText('ARCHIVED · V' + (previous + 1));
  await page.screenshot({ path: 'test-results/v3-reports.png' });
});
test('competing profile updates reject stale versions and command retries are idempotent', async ({
  page,
  browser,
}) => {
  await login(page);
  const s = await learner(page, 'CONNECT'),
    other = await browser.newContext(),
    second = await other.newPage();
  await login(second);
  const cfg = (await state(page)).operations!.students[s.id],
    body = {
      action: 'student-save',
      studentId: s.id,
      name: s.name,
      earlyLearner: true,
      settings: cfg,
      enrollmentDate: '2026-01-01',
      visitDays: [1, 3],
      tiles: [],
      goals: '',
      arrivalWindow: '',
    };
  const results = await Promise.all([
    page.request.post('/api/commands', {
      headers: { Origin: 'http://127.0.0.1:3100' },
      data: { kind: 'v3', command: body },
    }),
    second.request.post('/api/commands', {
      headers: { Origin: 'http://127.0.0.1:3100' },
      data: { kind: 'v3', command: { ...body, goals: 'Competing edit' } },
    }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const requestId = crypto.randomUUID(),
    retry = {
      kind: 'v3',
      requestId,
      command: { action: 'away', studentId: s.id, until: '2026-11-02' },
    };
  await page.request.post('/api/commands', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: retry,
  });
  const r = await page.request.post('/api/commands', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: retry,
  });
  expect((await r.json()).duplicate).toBe(true);
  await other.close();
});
for (const size of [
  { width: 1024, height: 768 },
  { width: 1194, height: 834 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
])
  test(
    'iPad/desktop ' +
      size.width +
      '×' +
      size.height +
      ' supports Quick View, profiles and visible prep without clipping',
    async ({ page }) => {
      await page.setViewportSize(size);
      await login(page);
      const s = await learner(page),
        v = await arrive(page, s.id);
      await page.reload();
      await page.locator('[data-visit-id="' + v.id + '"]').click();
      const d = page.getByRole('dialog'),
        primary = d.getByRole('button', { name: 'Complete instructor check-in' });
      await expect(primary).toBeVisible();
      const box = await primary.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(
        true,
      );
      await page.keyboard.press('Escape');
      await expect(d).toHaveCount(0);
      await page.getByRole('button', { name: /^Homework Preparation/ }).click();
      await page.getByLabel('Search preparation').fill(s.name);
      await expect(page.locator('.prep-entry')).toContainText('TAKE HOME');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await openProfile(page, s.name);
      await expect(page.getByRole('button', { name: 'Edit Student', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Visit History', exact: true }).click();
      await expect(page.locator('.visit-entry')).toContainText('No observations recorded');
      await page.screenshot({ path: 'test-results/v3-viewport-' + size.width + '.png' });
    },
  );
test('fictional center day: 50 expected, six early learners, mixed modes and exceptions across two staff clients', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await login(page);
  let db = await state(page);
  const ids = db.students.filter((s) => /^demo-student-/.test(s.id)).map((s) => s.id);
  for (const s of db.students.filter((s) => !ids.includes(s.id))) {
    if (db.visits.some((v) => v.studentId === s.id && !v.departedAt && !v.closedAt))
      await physical(page, s.id, 'out');
    await command(page, 'v3', { action: 'away', studentId: s.id, until: '2026-11-02' });
  }
  expect(ids.length).toBe(96);
  const today = dayKey(new Date(), db.timezone),
    day = new Date(today + 'T12:00:00Z').getUTCDay();
  expect(day).toBeGreaterThan(0);
  expect(day).toBeLessThan(5);
  for (let i = 0; i < 96; i++) {
    const s = db.students.find((s) => s.id === ids[i])!,
      cfg = structuredClone(db.operations!.students[s.id]);
    if (db.visits.some((v) => v.studentId === s.id && !v.departedAt && !v.closedAt))
      await physical(page, s.id, 'out');
    cfg.active = true;
    cfg.subjects.Math = {
      ...cfg.subjects.Math,
      enrolled: i % 3 !== 1,
      format: i % 5 === 0 ? 'CONNECT' : 'Paper',
      level: 'D',
      nextStart: 16,
      packetsPerDay: 1,
      sheetsPerPacket: 5,
    };
    cfg.subjects.Reading = {
      ...cfg.subjects.Reading,
      enrolled: i % 3 !== 0,
      format: i % 4 === 0 ? 'CONNECT' : 'Paper',
      level: '4A',
      nextStart: 11,
      packetsPerDay: 1,
      sheetsPerPacket: 5,
    };
    await command(page, 'v3', {
      action: 'student-save',
      studentId: s.id,
      name: s.name,
      earlyLearner: i < 6,
      settings: cfg,
      enrollmentDate: null,
      awayUntil: null,
      visitDays: i < 50 ? [...new Set([day, (i % 4) + 1])] : [day === 1 ? 2 : 1],
      tiles: [],
      goals: '',
      arrivalWindow: '',
    });
  }
  await page.reload();
  await expect(
    page.locator('.home-v3-metrics>div').filter({ hasText: 'Expected today' }),
  ).toContainText('50');
  const attended = [];
  for (const id of ids.slice(0, 8)) attended.push(await arrive(page, id));
  await page.reload();
  await expect(
    page.locator('.home-v3-metrics>div').filter({ hasText: 'Early learners here' }),
  ).toContainText('6');
  const second = await browser.newContext(),
    other = await second.newPage();
  await login(other, 'instructor');
  const connect = attended[0];
  await other.locator('[data-visit-id="' + connect.id + '"]').click();
  await expect(other.getByRole('dialog').locator('.packet-row')).toHaveCount(0);
  await other.getByRole('button', { name: 'Complete instructor check-in' }).click();
  await expect(other.getByRole('dialog')).toHaveCount(0);
  const paper = attended[2];
  await prepare(page, paper.studentId);
  await page.reload();
  await page.locator('[data-visit-id="' + paper.id + '"]').click();
  await page
    .getByRole('dialog')
    .getByRole('group', { name: 'Math', exact: true })
    .getByRole('button', { name: 'Corrections only', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Complete instructor check-in' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Reconcile prior packets on a separate session without touching real data.
  for (const [index, status] of [
    [6, 'unfinished'],
    [5, 'missing'],
  ] as const) {
    const first = attended[index];
    await prepare(page, first.studentId);
    await handoff(page, first);
    const before = await state(page),
      prior = before.operations!.assignments.find((a) => a.v3?.visitId === first.id)!.v3!.issued[0];
    await physical(page, first.studentId, 'out');
    const next = await arrive(page, first.studentId);
    await prepare(page, first.studentId);
    await page.reload();
    await page.locator('[data-visit-id="' + next.id + '"]').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Homework unfinished or not returned').check();
    await dialog
      .getByLabel('Incoming ' + prior.range.level + prior.range.start + '–' + prior.range.end)
      .selectOption(status);
    await dialog.getByRole('button', { name: 'Complete instructor check-in' }).click();
    await expect(dialog).toHaveCount(0);
    const actual = (await state(page)).operations!.assignments.find(
      (a) => a.v3?.visitId === next.id,
    )!.v3!.issued;
    expect(actual.some((p) => p.id === prior.id)).toBe(status === 'unfinished');
  }
  for (const [index, mode] of [
    [8, 'repeat'],
    [9, 'manual'],
  ] as const) {
    const v = await arrive(page, ids[index]);
    await prepare(page, v.studentId);
    await page.reload();
    await page.locator('[data-visit-id="' + v.id + '"]').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Adjust / Repeat', exact: true }).click();
    if (mode === 'repeat') {
      await dialog.getByLabel('Repeat from worksheet', { exact: true }).check();
      await dialog.getByLabel('Repeat starting worksheet').fill('1');
    } else {
      await dialog.getByLabel('Math packet 1 start').fill('80');
      await dialog.getByLabel('Math packet 1 end').fill('84');
      await dialog.getByLabel('Adjustment reason').fill('Fictional busy-day override');
    }
    await dialog.getByLabel('Physical materials adjusted and ready to hand over').check();
    await dialog.getByRole('button', { name: 'Complete instructor check-in' }).click();
    await expect(dialog).toHaveCount(0);
  }
  const unresolved = await arrive(page, ids[10]);
  await simulatedClosure(unresolved.id, today);
  await page.reload();
  await expect(
    page
      .locator('[data-visit-id="' + unresolved.id + '"]')
      .getByText('Departure unverified', { exact: true }),
  ).toBeVisible();
  await physical(page, attended[7].studentId, 'out');
  await page.reload();
  await expect(page.locator('[data-visit-id="' + attended[7].id + '"]')).toHaveClass(/departed/);
  await expect(page.locator('[data-visit-id="' + attended[7].id + '"]')).toContainText(
    'No handoff recorded',
  );
  await command(page, 'v3', { action: 'away', studentId: ids[49], until: '2026-11-02' });
  await page.reload();
  await expect(
    page.locator('.home-v3-metrics>div').filter({ hasText: 'Expected today' }),
  ).toContainText('49');
  db = await state(page);
  expect(ids.every((id) => db.students.some((s) => s.id === id))).toBe(true);
  expect(db.operations!.completions.length).toBe(0);
  await page.screenshot({ path: 'test-results/v3-busy-day.png' });
  await other.close();
});
