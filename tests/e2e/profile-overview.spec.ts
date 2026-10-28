import { test, expect } from '@playwright/test';
import { login, state, learner, openProfile, command } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import type { Snapshot } from '../../src/lib/model';

for (const width of [1440, 768, 390, 320])
  test('profile Overview has aligned rails and compact dialogs at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    const session = await state(page),
      fixture = quickViewDemo(new Date('2026-10-12T21:00:00Z'));
    fixture.students[0].name = 'Fictional Alexandra Verylongfamilyname Demo Student';
    const snapshot: Snapshot = {
      ...fixture,
      staff: session.staff,
      timezone: fixture.operations!.center.timezone,
    };
    await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
    let writes = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/commands') && r.method() === 'POST') writes++;
    });
    for (const [index, student] of fixture.students.entries()) {
      await page.goto('/?view=students&student=' + student.id);
      await expect(page.getByRole('heading', { name: student.name, exact: true })).toBeVisible();
      const left = page.getByRole('region', { name: 'Student information', exact: true }),
        right = page.getByRole('region', { name: 'Subjects', exact: true });
      await expect(left.locator('dt')).toHaveText([
        'Student name',
        'Grade',
        'Regular visits',
        'Early learner',
      ]);
      await expect(right.getByRole('tab')).toHaveCount(2);
      const leftRail = (await left.getByRole('tablist').boundingBox())!,
        rightRail = (await right.getByRole('tablist').boundingBox())!;
      if (width > 900) expect(Math.abs(leftRail.y - rightRail.y)).toBeLessThan(1);
      await left.getByRole('tab', { name: 'Enrollment', exact: true }).click();
      await expect(left.locator('dt')).toContainText([
        'Enrollment status',
        'Enrollment date',
        'Time enrolled',
      ]);
      await left.getByRole('tab', { name: 'Details', exact: true }).click();
      if (index === 0) {
        await left.getByRole('button', { name: 'Edit student information', exact: true }).click();
        const editor = page.getByRole('dialog', { name: 'Edit student information', exact: true });
        await expect(editor.getByLabel('Student name')).toHaveValue(student.name);
        await expect(editor.getByText('Select weekdays', { exact: true })).toHaveCount(0);
        await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
        await right.getByRole('button', { name: 'Edit Math', exact: true }).click();
        const math = page.getByRole('dialog', { name: 'Edit Math', exact: true });
        await expect(math.getByLabel('Worksheets per day')).toBeVisible();
        expect(await math.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await math.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
      if (!fixture.operations!.students[student.id].subjects.Reading.enrolled) {
        await right.getByRole('tab', { name: 'Reading', exact: true }).click();
        await right.getByRole('button', { name: 'Add Reading', exact: true }).click();
        await expect(
          page
            .getByRole('dialog', { name: 'Add Reading', exact: true })
            .getByRole('switch', { name: 'Enrolled' }),
        ).toBeChecked();
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (index === 0)
        await page.screenshot({
          path: 'test-results/arithmetica-profile-' + width + '.png',
          fullPage: true,
          animations: 'disabled',
        });
      await page.getByRole('button', { name: 'Visit History', exact: true }).click();
      await expect(
        page.getByText('Preserved V1/V2 worksheet and decision history', { exact: true }),
      ).toHaveCount(0);
    }
    expect(writes).toBe(0);
  });

test('profile section editors save independently, cancel drafts and reject stale updates', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page),
    initial = await state(page),
    cfg = initial.operations!.students[s.id];
  await command(page, 'v3', {
    action: 'student-save',
    studentId: s.id,
    name: s.name,
    earlyLearner: true,
    settings: cfg,
    enrollmentDate: '2026-01-01',
    visitDays: [1, 3],
    tiles: ['Focus, carefully'],
    goals: 'Preserve this goal',
    arrivalWindow: 'Recorded window',
  });
  await page.reload();
  await openProfile(page, s.name);
  await expect(page.getByRole('button', { name: 'Edit Student', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit student information', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const identity = page.getByRole('dialog', { name: 'Edit student information', exact: true });
  await identity.getByLabel('Student name').fill(s.name + ' Cancelled');
  await identity.getByLabel('Grade', { exact: true }).fill('Cancelled grade');
  await identity.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await state(page)).students.find((x) => x.id === s.id)!.name).toBe(s.name);
  expect((await state(page)).operations!.students[s.id].grade).toBeUndefined();
  const before = await state(page);
  await page.getByRole('button', { name: 'Edit student information', exact: true }).click();
  await identity.getByLabel('Grade', { exact: true }).fill('Grade 3');
  await identity.getByRole('tab', { name: 'Enrollment', exact: true }).click();
  await identity.getByLabel('Enrollment date', { exact: true }).fill('2026-02-01');
  await identity.getByRole('button', { name: 'Save changes' }).click();
  await expect(identity).toHaveCount(0);
  const saved = await state(page),
    updated = saved.operations!.students[s.id];
  expect(updated.enrollmentDate).toBe('2026-02-01');
  expect(updated.grade).toBe('Grade 3');
  expect(updated.expectedMinutes).toBe(before.operations!.students[s.id].expectedMinutes);
  expect(updated.subjects).toEqual(before.operations!.students[s.id].subjects);
  expect(updated.observationTiles).toEqual(['Focus, carefully']);
  expect(updated.goals).toBe('Preserve this goal');
  expect(updated.arrivalWindow).toBe('Recorded window');
  await page.getByRole('button', { name: 'Edit Math', exact: true }).click();
  const math = page.getByRole('dialog', { name: 'Edit Math', exact: true });
  await math.getByLabel('Worksheets per day').fill('20');
  await math.getByRole('button', { name: 'Save changes' }).click();
  await expect(math).toHaveCount(0);
  const after = await state(page);
  expect(after.operations!.students[s.id].subjects.Math.packetsPerDay).toBe(2);
  expect(after.operations!.students[s.id].subjects.Reading).toEqual(updated.subjects.Reading);
  expect(after.students.find((x) => x.id === s.id)).toEqual(
    saved.students.find((x) => x.id === s.id),
  );
  expect(after.operations!.students[s.id].enrollmentDate).toBe('2026-02-01');
  expect(after.operations!.students[s.id].grade).toBe('Grade 3');
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Student information', exact: true }),
  ).toContainText('Grade 3');
  await page.getByRole('button', { name: 'Edit student information', exact: true }).click();
  await identity.getByLabel('Student name').fill('Stale fictional draft');
  const current = after.operations!.students[s.id];
  await command(page, 'v3', {
    action: 'student-save',
    studentId: s.id,
    name: s.name,
    earlyLearner: true,
    settings: current,
    enrollmentDate: current.enrollmentDate || null,
    visitDays: [1, 3],
    tiles: current.observationTiles || [],
    goals: 'Newer goal',
    arrivalWindow: current.arrivalWindow || '',
  });
  await identity.getByRole('button', { name: 'Save changes' }).click();
  await expect(identity.getByRole('alert')).toContainText('profile changed');
  expect((await state(page)).students.find((x) => x.id === s.id)!.name).toBe(s.name);
  expect((await state(page)).operations!.students[s.id].goals).toBe('Newer goal');
});

test('profile achievement medals save by subject without evidence and retain earlier awards', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page),
    before = await state(page),
    cfg = before.operations!.students[s.id];
  cfg.subjects.Reading.enrolled = true;
  cfg.subjects.Reading.format = 'CONNECT';
  await command(page, 'v3', {
    action: 'student-save',
    studentId: s.id,
    name: s.name,
    earlyLearner: true,
    settings: cfg,
    enrollmentDate: cfg.enrollmentDate || null,
    visitDays: [1, 3],
    tiles: cfg.observationTiles || [],
    goals: cfg.goals || '',
    arrivalWindow: cfg.arrivalWindow || '',
  });
  await command(page, 'v2', {
    action: 'achievement',
    studentId: s.id,
    subject: 'Math',
    distinction: 'Bronze',
    date: '2026-09-01',
    evidence: 'Existing fictional source retained',
  });
  const priorAwards = (await state(page)).operations!.achievements;
  let afterMath = priorAwards;
  await page.reload();
  await openProfile(page, s.name);
  for (const [subject, distinction] of [
    ['Math', 'Silver'],
    ['Reading', 'Gold'],
  ] as const) {
    await page.getByRole('tab', { name: subject, exact: true }).click();
    const panel = page.getByRole('region', { name: subject + ' achievement medal', exact: true });
    await panel.getByRole('button', { name: 'Add medal', exact: true }).click();
    const form = panel.getByRole('form');
    await expect(
      form.getByRole('combobox', { name: 'Medal', exact: true }).locator('option'),
    ).toHaveText(['Bronze', 'Silver', 'Gold', 'Platinum']);
    await expect(form.getByText('Verification evidence')).toHaveCount(0);
    await form.getByRole('combobox', { name: 'Medal', exact: true }).selectOption(distinction);
    await form.getByLabel('Award date').fill('2026-10-10');
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await state(page)).operations!.achievements).toEqual(
      subject === 'Math' ? priorAwards : afterMath,
    );
    await panel.getByRole('button', { name: 'Add medal', exact: true }).click();
    await form.getByRole('combobox', { name: 'Medal', exact: true }).selectOption(distinction);
    await form.getByLabel('Award date').fill('2026-10-10');
    await form.getByRole('button', { name: 'Save medal', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(panel).toContainText(distinction);
    await expect(panel).toContainText('Oct 10, 2026');
    await expect(
      page.getByRole('img', {
        name: 'Current ' + subject + ' ' + distinction + ' achievement medal',
        exact: true,
      }),
    ).toBeVisible();
    const saved = await state(page),
      award = saved.operations!.achievements.at(-1)!;
    expect(award).toMatchObject({
      studentId: s.id,
      subject,
      distinction,
      date: '2026-10-10',
      evidence: '',
      verifiedBy: before.staff.name,
    });
    for (const prior of priorAwards) expect(saved.operations!.achievements).toContainEqual(prior);
    if (subject === 'Math') afterMath = saved.operations!.achievements;
  }
  await page.reload();
  await expect(
    page.getByRole('img', { name: 'Current Math Silver achievement medal', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Current Reading Gold achievement medal', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Math', exact: true }).click();
  await expect(page.getByText('Previous medals (1)')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Math achievement medal', exact: true }),
  ).toContainText('Bronze');
  const mathHistory = page.getByRole('list', { name: 'Math achievement medal history' });
  await expect(mathHistory.getByRole('listitem').first()).toContainText('Silver');
  await expect(mathHistory.getByText('Current', { exact: true })).toHaveCount(1);
  await expect(mathHistory.getByRole('listitem').nth(1)).toContainText('Bronze');
});
