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
import { dayKey, isOpenVisit } from '../../src/lib/model';
import { currentSets, packetLabel } from '../../src/lib/v3-planning';
import { addDays } from '../../src/lib/schedule';
import type { Visit } from '../../src/lib/model';
test('Home has four metrics, direct waiting Quick View and only the V3 navigation', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page, 'CONNECT'),
    v = await arrive(page, s.id);
  await page.reload();
  await expect(page.locator('.home-v3-metrics>button')).toHaveCount(4);
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
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.screenshot({ path: 'test-results/v3-home.png' });
});
test('Home tiles toggle exclusive filters, preserve repeated visits and open expected profiles without attendance', async ({
  page,
}) => {
  await login(page);
  const db = await state(page),
    at = '2026-10-12T20:00:00Z';
  db.students = db.students.slice(0, 6);
  for (const [index, s] of db.students.entries()) {
    const cfg = db.operations!.students[s.id];
    cfg.active = true;
    cfg.awayUntil = null;
    cfg.visitDays = [1];
    s.earlyLearner = index === 0;
  }
  db.operations!.center.closedDates = [];
  const visit = (index: number, id: string): Visit => ({
    id,
    studentId: db.students[index].id,
    arrivedAt: at,
    departedAt: null,
  });
  db.visits = [
    visit(0, 'home-waiting'),
    visit(1, 'home-other'),
    {
      ...visit(2, 'home-left'),
      departedAt: '2026-10-12T20:30:00Z',
      departureVerified: true,
    },
    {
      ...visit(3, 'home-auto'),
      closedAt: '2026-10-12T20:40:00Z',
      departureVerified: false,
    },
    {
      ...visit(0, 'home-repeat'),
      arrivedAt: '2026-10-12T18:00:00Z',
      departedAt: '2026-10-12T19:00:00Z',
      departureVerified: true,
    },
  ];
  await page.clock.install({ time: new Date('2026-10-12T21:00:00Z') });
  await page.route('**/api/state', (route) => route.fulfill({ json: db }));
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/commands')) writes++;
  });
  await page.reload();
  const tiles = page.locator('.home-v3-metrics'),
    rows = page.locator('.live-v3-row'),
    expected = tiles.getByRole('button', { name: /^Still expected/ }),
    here = tiles.getByRole('button', { name: /^Here now/ }),
    early = tiles.getByRole('button', { name: /^Early learners here/ }),
    out = tiles.getByRole('button', { name: /^Checked out/ });
  await expect(rows).toHaveCount(7);
  for (const [tile, count] of [
    [expected, '2'],
    [here, '2'],
    [early, '1'],
    [out, '2'],
  ] as const) {
    await expect(tile.locator('b')).toHaveText(count);
    await expect(tile).toHaveAttribute('aria-pressed', 'false');
  }
  await expected.click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Not arrived');
  await expect(expected).toHaveAttribute('aria-pressed', 'true');
  await here.click();
  await expect(rows).toHaveCount(2);
  await expect(expected).toHaveAttribute('aria-pressed', 'false');
  await early.click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toHaveAttribute('data-visit-id', 'home-waiting');
  await expect(here).toHaveAttribute('aria-pressed', 'false');
  await out.focus();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(2);
  await expect(page.locator('[data-visit-id="home-auto"]')).toHaveCount(0);
  await expect(page.locator('[data-visit-id="home-repeat"]')).toBeVisible();
  await expect(tiles.locator('[aria-pressed="true"]')).toHaveCount(1);
  await out.click();
  await expect(rows).toHaveCount(7);
  await expect(tiles.locator('[aria-pressed="true"]')).toHaveCount(0);
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(out).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/home-tiles-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await expected.click();
  await page
    .locator('[data-expected-student-id="' + db.students[4].id + '"]')
    .getByRole('button', {
      name: 'Open profile for ' + db.students[4].name,
      exact: true,
    })
    .click();
  await expect(page.getByRole('heading', { name: new RegExp(db.students[4].name) })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await here.click();
  db.visits[0].departedAt = '2026-10-12T21:00:00Z';
  db.visits[0].departureVerified = true;
  db.revision++; // Match the repository contract for a new saved snapshot.
  await expect(here.locator('b')).toHaveText('1', { timeout: 15000 });
  await expect(rows).toHaveCount(1);
  await expect(out.locator('b')).toHaveText('3');
  expect(writes).toBe(0);
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
  await page.getByRole('button', { name: 'Edit student information', exact: true }).click();
  await page.getByRole('switch', { name: 'Early learner', exact: true }).check();
  await page.getByRole('dialog').getByRole('tab', { name: 'Enrollment', exact: true }).click();
  await page.getByLabel('Enrollment date', { exact: true }).fill('2026-01-01');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Math', exact: true }).click();
  await page.getByLabel('Worksheets per day').fill('3');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page
      .locator('.overview-subject-panel:visible dl > div')
      .filter({ hasText: 'Worksheets per day' })
      .locator('dd'),
  ).toHaveText('3');
  await expect(page.getByRole('button', { name: 'Withdraw student' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit student information', exact: true }).click();
  await page.getByRole('dialog').getByRole('tab', { name: 'Enrollment', exact: true }).click();
  await page.getByLabel('Enrollment status').selectOption('inactive');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page
    .getByRole('region', { name: 'Student information', exact: true })
    .getByRole('tab', { name: 'Enrollment', exact: true })
    .click();
  await expect(page.locator('.overview-student dd').first()).toHaveText('Active');
  for (const [value, label] of [
    ['inactive', 'Inactive'],
    ['active', 'Active'],
  ]) {
    await page.getByRole('button', { name: 'Edit student information', exact: true }).click();
    await page.getByLabel('Enrollment status').selectOption(value);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(
      page.getByRole('dialog', {
        name: 'Edit student information',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.locator('.overview-student dd').first()).toHaveText(label);
  }
  const db = await state(page),
    s = db.students.find((s) => s.name === name)!;
  await page.getByRole('button', { name: 'Show pouch identifier' }).click();
  const pouch = page.getByRole('dialog', {
    name: 'Pouch identifier',
    exact: true,
  });
  await expect(pouch.getByRole('link', { name: 'Print 2 × 2 label', exact: true })).toBeVisible();
  expect((await state(page)).students.find((x) => x.id === s.id)!.token).toBe(s.token);
  await pouch.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No packet completions recorded' })).toBeVisible();
  await page.screenshot({ path: 'test-results/v3-profile.png' });
});
test('roster filters are requested, applied explicitly and cleared without losing search', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page),
    db = await state(page),
    cfg = structuredClone(db.operations!.students[s.id]);
  cfg.subjects.Reading = {
    ...cfg.subjects.Math,
    enrolled: true,
    format: 'CONNECT',
  };
  await command(page, 'v3', {
    action: 'student-save',
    studentId: s.id,
    name: s.name,
    earlyLearner: false,
    settings: cfg,
    enrollmentDate: '2026-01-01',
    visitDays: [1, 3],
    tiles: [],
    goals: '',
    arrivalWindow: '',
  });
  await page.getByRole('button', { name: 'Student Roster', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search Student Roster' }),
    filters = page.getByRole('button', { name: /^Filters/ }),
    panel = page.getByRole('form', { name: 'Roster filters' }),
    rows = page.locator('.roster-v3-row');
  await expect(search).toBeVisible();
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toHaveCount(0);
  await search.fill(s.id);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Math / Reading · CONNECT');
  await expect(rows).not.toContainText('PAPER');

  await filters.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  async function checkFilterLayout(width: number) {
    await page.setViewportSize({ width, height: 1000 });
    const selects = await panel.locator('select').evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    expect(selects).toHaveLength(2);
    for (const select of selects) expect(select.height).toBeGreaterThanOrEqual(44);
    const dialogBox = (await page
      .getByRole('dialog', { name: 'Filter students', exact: true })
      .boundingBox())!;
    for (const select of selects) {
      expect(select.width).toBeGreaterThan(140);
      expect(select.x).toBeGreaterThanOrEqual(dialogBox.x);
      expect(select.x + select.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width);
    }
    await expect(panel.getByRole('switch', { name: 'Early learner', exact: true })).toBeVisible();
    await expect(panel.getByRole('group', { name: 'Visit weekdays', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/roster-filters-${width}.png`,
      fullPage: true,
    });
  }
  await checkFilterLayout(1440);
  await checkFilterLayout(1024);
  await expect(page.getByLabel('Medal filter')).toHaveCount(0);
  await panel.getByLabel('Subject', { exact: true }).selectOption('Math');
  await panel.getByLabel('Format', { exact: true }).selectOption('CONNECT');
  await expect(rows).toHaveCount(1);
  await panel.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(filters).toBeFocused();
  await expect(filters).toHaveAttribute('aria-label', 'Filters (active)');
  await expect(panel).toHaveCount(0);

  await filters.click();
  await panel.getByLabel('Subject', { exact: true }).selectOption('Reading');
  await panel.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await filters.click();
  await panel.getByLabel('Subject', { exact: true }).selectOption('Math');
  await page.keyboard.press('Escape');
  await filters.click();
  await expect(panel.getByLabel('Subject', { exact: true })).toHaveValue('Reading');
  await panel.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(search).toHaveValue(s.id);
  await expect(filters).toHaveAttribute('aria-label', 'Filters');
  await expect(rows).toHaveCount(1);
  await expect(panel.getByLabel('Enrollment status')).toHaveCount(0);

  for (const control of ['Early learner', 'Tue']) {
    await panel
      .getByRole(control === 'Early learner' ? 'switch' : 'button', {
        name: control,
        exact: true,
      })
      .click();
    await expect(rows).toHaveCount(1);
    await panel.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(rows).toHaveCount(0);
    await filters.click();
    await panel.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(rows).toHaveCount(1);
  }

  await panel.getByLabel('Subject', { exact: true }).selectOption('Math');
  await panel.getByLabel('Format', { exact: true }).selectOption('Paper');
  await panel.getByRole('button', { name: 'Mon', exact: true }).click();
  await panel.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await search.fill(s.name);
  await expect(rows).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await filters.click();
  await checkFilterLayout(390);
  await checkFilterLayout(320);
  await expect(panel.getByRole('button', { name: 'Apply', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(search).toHaveValue(s.name);
  await expect(rows).toHaveCount(1);
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
  await expect(card).toContainText('In-center packet');
  await expect(card).toContainText('Homework');
  expect(await card.locator('.packet-chip').count()).toBeGreaterThan(2);
  expect(await card.locator('details').count()).toBe(0);
  await card.getByRole('button', { name: 'Mark Math prepared' }).click();
  await expect(card).toContainText('Prepared');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Mark Reading prepared', exact: true }).click();
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
test('Quick View saves subjects independently and preserves context and attendance', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page),
    db = await state(page),
    cfg = structuredClone(db.operations!.students[s.id]);
  cfg.subjects.Reading = { ...cfg.subjects.Math, enrolled: true, level: '4A' };
  await command(page, 'v3', {
    action: 'student-save',
    studentId: s.id,
    name: s.name,
    earlyLearner: true,
    settings: cfg,
    enrollmentDate: null,
    visitDays: [1, 3],
    tiles: [],
    goals: 'Practice careful handwriting',
    arrivalWindow: '',
  });
  const visit = await arrive(page, s.id);
  await prepare(page, s.id);
  await page.reload();
  await page.locator('[data-visit-id="' + visit.id + '"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: s.name, exact: true })).toBeVisible();
  await expect(dialog.locator('.quick-student-identity')).toContainText('Waited:');
  await expect(dialog.locator('.quick-context')).toContainText('Practice careful handwriting');
  await expect(dialog.getByRole('button', { name: 'Check in Math', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Corrections', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Reading', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Packet', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('tab', { name: 'Math', exact: true })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Corrections', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.locator('.v3-modal-body > section').last()).toHaveClass(/quick-note/);
  await dialog.getByRole('button', { name: 'Focus: 4 out of 5', exact: true }).click();
  await dialog.getByRole('button', { name: '+ Add custom', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Custom observation skill' })
    .fill('Following instructions');
  await page
    .getByRole('dialog', { name: 'Add skill', exact: true })
    .getByRole('button', { name: 'Add skill', exact: true })
    .click();
  await dialog.getByLabel('Instructional note').fill('Fictional independent Math review.');
  await dialog.getByRole('button', { name: 'Check in Math', exact: true }).click();
  await expect(dialog.getByRole('tab', { name: 'Math confirmed', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Check in Reading', exact: true })).toBeVisible();
  const partial = await state(page),
    pending = partial.visits.find((v) => v.id === visit.id)!;
  expect(partial.observations.filter((o) => o.visitId === visit.id).at(-1)!.skillRatings).toEqual([
    { id: 'focus', label: 'Focus', score: 4 },
  ]);
  expect(partial.operations!.students[s.id].observationSkills!.at(-1)!.label).toBe(
    'Following instructions',
  );
  await expect(
    dialog.getByRole('group', { name: 'Focus rating' }).getByRole('button', { pressed: true }),
  ).toHaveCount(0);
  expect(pending.subjectCheckIns!.Math!.activities.Math).toBe('Corrections only');
  expect(pending.subjectCheckIns!.Reading).toBeUndefined();
  expect(pending.handoff).toBeUndefined();
  expect(pending.departedAt).toBeNull();
  expect(
    partial
      .operations!.assignments.filter((a) => a.v3?.visitId === visit.id && a.subject === 'Reading')
      .every((a) => !a.v3!.issuedAt),
  ).toBe(true);
  await dialog.getByRole('button', { name: 'Check in Reading', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await state(page),
    latest = saved.visits.find((v) => v.id === visit.id)!;
  expect(latest.handoff!.activities).toEqual({
    Math: 'Corrections only',
    Reading: 'Worksheets',
  });
  expect(latest.handoff!.assignmentIds).toHaveLength(2);
  expect(latest.departedAt).toBeNull();
  expect(saved.operations!.completions.length).toBe(db.operations!.completions.length);
  await page.locator('[data-visit-id="' + visit.id + '"]').click();
  await expect(dialog.getByRole('tab', { name: 'Math confirmed', exact: true })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Reading confirmed', exact: true })).toBeVisible();
  await expect(dialog.locator('.quick-student-identity')).toContainText('Time here:');
  await page.keyboard.press('Escape');
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
      await d.getByRole('button', { name: 'Corrections', exact: true }).click();
      await expect(d.getByRole('button', { name: 'Corrections', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    } else {
      await d
        .getByRole('button', {
          name: mode === 'repeat' ? 'Repeat' : 'Adjust',
          exact: true,
        })
        .click();
      if (mode === 'repeat') {
        await d.getByLabel('Starting worksheet/page', { exact: true }).fill('1');
        await d.getByLabel('Repeat reason', { exact: true }).fill('Fictional focused practice');
        await expect(d.getByRole('heading', { name: 'Proposed plan' })).toBeVisible();
        await d.getByRole('button', { name: 'Confirm repeat plan', exact: true }).click();
      } else {
        const originalStart = await d.getByLabel('Math packet 1 start').inputValue();
        await d.getByLabel('Math packet 1 start').fill('80');
        await d.getByRole('button', { name: 'Reset', exact: true }).click();
        await d.getByRole('button', { name: 'Adjust', exact: true }).click();
        await expect(d.getByLabel('Math packet 1 start')).toHaveValue(originalStart);
        await d.getByLabel('Math packet 1 start').fill('80');
        await d.getByLabel('Math packet 1 end').fill('84');
        await expect(d.locator('.quick-outgoing-heading')).toContainText('Prepared');
        await d.getByLabel('Adjustment reason').fill('Fictional instructor override');
        await d.getByRole('button', { name: 'Confirm adjustment', exact: true }).click();
        await expect(d.locator('.quick-outgoing-heading')).toContainText('Not prepared');
      }
    }
    await d.getByRole('button', { name: /Check in (Math|Reading)/ }).click();
    await expect(d).toHaveCount(0);
    await expect(page.locator('[data-visit-id="' + v.id + '"]')).toHaveClass(/ready/);
    const latest = await state(page),
      a = latest.operations!.assignments.find((a) => a.v3?.visitId === v.id)!;
    expect(a.v3!.issued.length).toBe(a.targetPackets);
    expect(latest.operations!.completions.filter((c) => c.studentId === s.id)).toHaveLength(0);
    if (mode === 'shift') {
      expect(a.v3!.held.length).toBe(1);
      expect(a.v3!.inCenter).toBeNull();
    }
    if (mode === 'repeat') {
      expect(a.v3!.inCenter!.range.start).toBe(1);
      expect(a.v3!.issued[0].range.start).toBe(6);
      expect(latest.operations!.students[s.id].subjects.Math.nextStart).toBe(16);
    }
    if (mode === 'manual') expect(a.v3!.issued[0].range.start).toBe(80);
    await page.locator('[data-visit-id="' + v.id + '"]').click();
    await expect(d.getByRole('button', { name: /Check in (Math|Reading)/ })).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Traffic', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Traffic', exact: true })).toBeVisible();
  await expect(page.getByLabel('Attendance for selected period')).toBeVisible();
  await page.getByRole('button', { name: 'Weekly', exact: true }).click();
  await expect(page.locator('.activity-comparison .attendance-column')).toHaveCount(7);
  expect(Array.isArray((await state(page)).operations!.appointments)).toBe(true);
  await page.screenshot({ path: 'test-results/v3-activity.png' });
});
test('automatic report navigation hides revisions while legacy archive APIs remain immutable', async ({
  page,
}) => {
  await login(page);
  await page.goto('/?view=reports');
  await expect(page.getByText('Saved snapshots', { exact: true })).toHaveCount(0);
  const origin = new URL(page.url()).origin;
  for (const kind of ['daily', 'weekly', 'monthly']) {
    const data = {
      kind,
      period: '2026-10-14',
      reason: 'Fictional retained archive API',
      newVersion: true,
      requestId: crypto.randomUUID(),
    };
    const response = await page.request.post('/api/reports', {
      headers: { Origin: origin },
      data,
    });
    expect(response.ok()).toBe(true);
    const { id } = await response.json();
    const first = await (await page.request.get('/api/reports?id=' + id)).json();
    expect(first.kind).toBe(kind);
    expect((await page.request.get('/api/reports?id=' + id + '&format=xlsx')).status()).toBe(
      kind === 'monthly' ? 200 : 400,
    );
    const again = await page.request.post('/api/reports', {
      headers: { Origin: origin },
      data,
    });
    expect((await again.json()).id).toBe(id);
    expect(await (await page.request.get('/api/reports?id=' + id)).json()).toEqual(first);
  }
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export Excel', exact: true })).toBeVisible();
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
      headers: { Origin: new URL(page.url()).origin },
      data: { kind: 'v3', command: body },
    }),
    second.request.post('/api/commands', {
      headers: { Origin: new URL(page.url()).origin },
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
    headers: { Origin: new URL(page.url()).origin },
    data: retry,
  });
  const r = await page.request.post('/api/commands', {
    headers: { Origin: new URL(page.url()).origin },
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
        primary = d.getByRole('button', { name: /Check in (Math|Reading)/ });
      await expect(primary).toBeVisible();
      await primary.scrollIntoViewIfNeeded();
      await expect(primary).toBeInViewport();
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
      await expect(
        page.locator('.prep-entry').getByRole('heading', { name: 'Homework', exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await openProfile(page, s.name);
      await expect(
        page.getByRole('button', {
          name: 'Edit student information',
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Visit History', exact: true }).click();
      await expect(page.locator('.visit-entry')).toContainText('Checked in');
      await expect(page.getByText('Visit details', { exact: true })).toHaveCount(0);
      await page.screenshot({
        path: 'test-results/v3-viewport-' + size.width + '.png',
      });
    },
  );
test('fictional center day: weekday/weekend expectations, six early learners and mixed modes across two staff clients', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await login(page);
  async function confirmSubjects(client: typeof page) {
    const dialog = client.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (let count = 0; count < 2 && (await dialog.isVisible()); count++) {
      const pending = dialog.getByRole('tab').filter({ hasNotText: 'confirmed' }).first();
      if (!(await pending.count())) {
        // A subject recorded through the API is already confirmed and read-only.
        await client.keyboard.press('Escape');
        break;
      }
      const subject = (await pending.textContent())!.trim();
      await pending.click();
      await dialog.getByRole('button', { name: /^Check in (Math|Reading)$/ }).click();
      // A click returns before the save completes. Wait for this subject's
      // confirmation or dialog closure before attempting the next subject.
      await expect
        .poll(() =>
          client
            .locator('#quick-tab-' + subject)
            .evaluateAll((tabs) => !tabs.length || tabs[0].textContent!.includes('confirmed')),
        )
        .toBe(true);
    }
    await expect(dialog).toHaveCount(0);
  }
  let db = await state(page);
  const completionsBeforeBusyDay = structuredClone(db.operations!.completions);
  const today = dayKey(new Date(), db.timezone),
    day = new Date(today + 'T12:00:00Z').getUTCDay(),
    operatingDay = day >= 1 && day <= 4,
    scheduleDay = operatingDay ? day : day === 0 ? 2 : 1,
    tomorrow = (day + 1) % 7,
    awayDate = addDays(today, 14 + ((8 - day) % 7));
  const ids = db.students.filter((s) => /^demo-student-/.test(s.id)).map((s) => s.id);
  for (const s of db.students.filter((s) => !ids.includes(s.id))) {
    if (db.visits.some((v) => v.studentId === s.id && !v.departedAt && !v.closedAt))
      await physical(page, s.id, 'out');
    await command(page, 'v3', {
      action: 'away',
      studentId: s.id,
      until: awayDate,
    });
  }
  expect(ids.length).toBe(96);
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
      visitDays: (i < 50 ? [...new Set([scheduleDay, (i % 4) + 1])] : [scheduleDay === 1 ? 3 : 1])
        .filter((d) => d !== tomorrow)
        .concat(!operatingDay ? [scheduleDay] : []),
      tiles: [],
      goals: '',
      arrivalWindow: '',
    });
  }
  await page.reload();
  db = await state(page);
  await expect(
    page.locator('.home-v3-metrics>button').filter({ hasText: 'Still expected' }).locator('b'),
  ).toHaveText(
    String(
      (operatingDay ? ids : [])
        .slice(0, 50)
        .filter(
          (id) =>
            !db.visits.some(
              (v) =>
                v.studentId === id &&
                (dayKey(v.arrivedAt, db.timezone) === today || isOpenVisit(v)),
            ),
        ).length,
    ),
  );
  const attended = [];
  for (const id of ids.slice(0, 8)) attended.push(await arrive(page, id));
  await page.reload();
  await expect(
    page.locator('.home-v3-metrics>button').filter({ hasText: 'Early learners here' }),
  ).toContainText('6');
  const second = await browser.newContext(),
    other = await second.newPage();
  await login(other, 'instructor');
  const connect = attended[0];
  await other.locator('[data-visit-id="' + connect.id + '"]').click();
  await expect(other.getByRole('dialog').locator('.packet-row')).toHaveCount(0);
  await confirmSubjects(other);
  await expect(other.getByRole('dialog')).toHaveCount(0);
  const paper = attended[2];
  await prepare(page, paper.studentId);
  await page.reload();
  await page.locator('[data-visit-id="' + paper.id + '"]').click();
  await page.getByRole('dialog').getByRole('tab', { name: 'Math', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Corrections', exact: true }).click();
  await confirmSubjects(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Reconcile prior packets on a separate session without touching real data.
  for (const [index, status] of [
    [6, 'unfinished'],
    [3, 'missing'],
  ] as const) {
    const first = attended[index];
    await prepare(page, first.studentId);
    await handoff(page, first);
    const before = await state(page),
      prior = before.operations!.assignments.find((a) => a.v3?.visitId === first.id)!.v3!.issued[0];
    await physical(page, first.studentId, 'out');
    const next = await arrive(page, first.studentId);
    await prepare(page, first.studentId);
    if (status === 'missing') {
      const a = currentSets(await state(page), next).find((a) => a.subject === 'Math')!;
      await command(page, 'v3', {
        action: 'handoff',
        subject: 'Math',
        activity: 'Worksheets',
        visitId: next.id,
        expectedAt: null,
        subjects: [
          {
            subject: 'Math',
            assignmentId: a.id,
            version: a.v3!.version,
            activity: 'Worksheets',
            exception: true,
            incoming: [{ id: prior.id, state: 'missing' }],
            actual: null,
            repeat: null,
            physicalConfirmed: true,
            reason: 'Fictional missing packet',
          },
        ],
        choices: [],
        text: '',
        followUp: false,
        correctionReason: '',
      });
    }
    await page.reload();
    await page.locator('[data-visit-id="' + next.id + '"]').click();
    const dialog = page.getByRole('dialog');
    if (status === 'unfinished')
      await dialog
        .getByRole('button', {
          name: 'Mark unfinished ' + packetLabel(prior),
          exact: true,
        })
        .click();
    await confirmSubjects(page);
    const actual = (await state(page)).operations!.assignments.find(
      (a) => a.v3?.visitId === next.id && a.subject === 'Math',
    )!.v3!;
    expect(actual.issued.some((p) => p.id === prior.id)).toBe(false);
    expect(actual.inCenterReturns?.some((p) => p.id === prior.id) || false).toBe(
      status === 'unfinished',
    );
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
    await dialog
      .getByRole('button', {
        name: mode === 'repeat' ? 'Repeat' : 'Adjust',
        exact: true,
      })
      .click();
    if (mode === 'repeat') {
      await dialog.getByLabel('Starting worksheet/page', { exact: true }).fill('1');
      await dialog.getByLabel('Repeat reason', { exact: true }).fill('Fictional focused practice');
      await dialog.getByRole('button', { name: 'Confirm repeat plan', exact: true }).click();
    } else {
      await dialog.getByLabel('Math packet 1 start').fill('80');
      await dialog.getByLabel('Math packet 1 end').fill('84');
      await dialog.getByLabel('Adjustment reason').fill('Fictional busy-day override');
      await dialog.getByRole('button', { name: 'Confirm adjustment', exact: true }).click();
    }
    await confirmSubjects(page);
    await expect(dialog).toHaveCount(0);
  }
  const unresolved = await arrive(page, ids[10]);
  await simulatedClosure(unresolved.id, today);
  await page.reload();
  const automaticallyClosed = (await state(page)).visits.find((v) => v.id === unresolved.id)!;
  expect(automaticallyClosed.closedAt).toBeTruthy();
  expect(automaticallyClosed.departedAt).toBeNull();
  expect(automaticallyClosed.departureVerified).toBe(false);
  await physical(page, attended[7].studentId, 'out');
  await page.reload();
  await expect(page.locator('[data-visit-id="' + attended[7].id + '"]')).toHaveClass(/departed/);
  await expect(page.locator('[data-visit-id="' + attended[7].id + '"]')).toContainText(
    'No handoff recorded',
  );
  await command(page, 'v3', {
    action: 'away',
    studentId: ids[49],
    until: awayDate,
  });
  await page.reload();
  db = await state(page);
  await expect(
    page.locator('.home-v3-metrics>button').filter({ hasText: 'Still expected' }).locator('b'),
  ).toHaveText(
    String(
      (operatingDay ? ids : [])
        .slice(0, 49)
        .filter(
          (id) =>
            !db.visits.some(
              (v) =>
                v.studentId === id &&
                (dayKey(v.arrivedAt, db.timezone) === today || isOpenVisit(v)),
            ),
        ).length,
    ),
  );
  db = await state(page);
  expect(ids.every((id) => db.students.some((s) => s.id === id))).toBe(true);
  expect(db.operations!.completions).toEqual(completionsBeforeBusyDay);
  await page.screenshot({ path: 'test-results/v3-busy-day.png' });
  await other.close();
});

test('active Quick View name and avatar open the matching profile without changing attendance', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page, 'CONNECT'),
    v = await arrive(page, s.id);
  await page.reload();
  const before = await state(page);
  for (const target of ['name', 'avatar']) {
    await page.locator('[data-visit-id="' + v.id + '"]').click();
    const dialog = page.getByRole('dialog');
    const link = dialog.getByRole('button', {
      name: 'Open profile for ' + s.name,
      exact: true,
    });
    if (target === 'avatar') await link.locator('.avatar').click();
    else await link.getByText(s.name, { exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: s.name, exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp('student=' + s.id));
    expect((await state(page)).visits).toEqual(before.visits);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
  }
});
