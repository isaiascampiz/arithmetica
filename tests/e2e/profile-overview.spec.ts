import { test, expect } from '@playwright/test';
import { login, state, learner, openProfile, command } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import type { Snapshot } from '../../src/lib/model';

for (const width of [1440, 390, 320])
  test('profile Overview presents balanced recorded information at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    const session = await state(page),
      fixture = quickViewDemo(new Date('2026-10-12T21:00:00Z'));
    fixture.students[0].name = 'Fictional Alexandra Verylongfamilyname Demo Student';
    fixture.operations!.students[fixture.students[1].id].enrollmentDate = null;
    delete fixture.operations!.students[fixture.students[1].id].grade;
    fixture.operations!.students[fixture.students[1].id].active = false;
    const snapshot: Snapshot = {
      ...fixture,
      staff: session.staff,
      timezone: fixture.operations!.center.timezone,
      runtime: { demo: true, adapter: 'local', scheduler: false },
    };
    await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
    let writes = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/commands') && r.method() === 'POST') writes++;
    });
    for (const [index, s] of fixture.students.entries()) {
      await page.goto('/?view=students&student=' + s.id);
      await expect(page.getByRole('heading', { name: s.name, exact: true })).toBeVisible();
      const student = page.getByRole('region', { name: 'Student information', exact: true });
      const subjects = page.getByRole('region', { name: 'Subjects', exact: true });
      await expect(student).toContainText('Regular visits');
      await expect(student.locator('dt')).toHaveText([
        'Student name',
        'Grade',
        'Early learner',
        'Regular visits',
        'Expected visit duration',
        'Enrollment status',
        'Enrollment date',
        'Time enrolled',
      ]);
      await expect(
        student
          .locator('dl > div')
          .filter({ has: page.locator('dt', { hasText: /^Grade$/ }) })
          .locator('dd'),
      ).toHaveText(index === 1 ? 'Not recorded' : fixture.operations!.students[s.id].grade!);
      await expect(page.getByRole('button', { name: 'Other student settings' })).toHaveCount(0);
      await expect(
        subjects.getByRole('heading', { name: 'Achievement medal history', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.profile-name-medals [role="img"]')).toHaveCount(
        index === 2 ? 1 : 2,
      );
      const avatar = (await page.locator('.profile-v3-heading > .avatar').boundingBox())!;
      const headerMedals = (await page
        .locator('.profile-heading-identity > .profile-name-medals')
        .boundingBox())!;
      expect(
        Math.abs(avatar.y + avatar.height / 2 - headerMedals.y - headerMedals.height / 2),
      ).toBeLessThan(1);
      if (index === 0) {
        const history = subjects.getByRole('list', { name: 'Math achievement medal history' });
        const medals = history.getByRole('listitem');
        await expect(medals).toHaveCount(2);
        await expect(medals.nth(0)).toContainText('Gold');
        await expect(medals.nth(0)).toContainText('Current');
        await expect(medals.nth(1)).toContainText('Bronze');
        await expect(medals.nth(1)).toBeVisible();
        const first = (await medals.nth(0).boundingBox())!,
          previous = (await medals.nth(1).boundingBox())!;
        expect(first.y).toBe(previous.y);
        expect(previous.x).toBeGreaterThan(first.x);
        await expect(page.locator('.profile-name-medals .bronze')).toHaveCount(0);
      }
      await expect(page.locator('.profile-v3-heading .avatar')).toBeVisible();
      await expect(subjects.locator('.overview-subject-panel')).toHaveCount(index === 2 ? 1 : 2);
      await expect(subjects.getByRole('tab')).toHaveCount(index === 2 ? 0 : 2);
      if (index === 1) {
        await expect(student).toContainText('Not recorded');
        await expect(student).toContainText('Unenrolled');
        await subjects.getByRole('tab', { name: 'Reading', exact: true }).click();
        await expect(subjects.getByRole('region', { name: 'Reading', exact: true })).toBeVisible();
        await expect(subjects).toContainText('Kumon CONNECT');
        await subjects.getByRole('tab', { name: 'Math', exact: true }).click();
        const workload = subjects
          .getByRole('region', { name: 'Math', exact: true })
          .locator('dl > div')
          .filter({ hasText: 'Planned worksheets per homework day' })
          .locator('dd');
        const settings = fixture.operations!.students[s.id].subjects.Math;
        await expect(workload).toHaveText(
          String(settings.packetsPerDay * settings.sheetsPerPacket),
        );
      }
      const left = (await student.boundingBox())!,
        right = (await subjects.boundingBox())!;
      if (width > 700) {
        expect(left.y).toBe(right.y);
        expect(Math.abs(left.height - right.height)).toBeLessThan(1);

        expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
      } else {
        expect(left.x).toBe(right.x);
        expect(right.y).toBeGreaterThanOrEqual(left.y + left.height);
      }
      await expect(page.getByRole('button', { name: 'Show pouch identifier' })).toBeVisible();
      await expect(student.locator('.profile-enrollment')).toContainText('Enrollment status');
      await expect(subjects).toContainText('Starting level');
      await expect(subjects).not.toContainText('Current range');
      await expect(
        page.getByRole('button', { name: 'Edit student information', exact: true }),
      ).toBeVisible();
      if (index === 0) {
        const labelColumn = (await student.locator('dt').first().boundingBox())!.x;
        const rowPositions = await student
          .locator('dt')
          .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().y));
        await page.getByRole('button', { name: 'Edit student information', exact: true }).click();
        const form = page.getByRole('form', { name: 'Edit student information', exact: true });
        expect((await form.locator('dt').first().boundingBox())!.x).toBe(labelColumn);
        const editedPositions = await form
          .locator('dt')
          .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().y));
        editedPositions.forEach((y, i) => expect(Math.abs(y - rowPositions[i])).toBeLessThan(1));
        if (width > 700) {
          const editingLeft = (await student.boundingBox())!;
          const editingRight = (await subjects.boundingBox())!;
          expect(Math.abs(editingLeft.height - editingRight.height)).toBeLessThan(1);
        }
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(await form.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await page.screenshot({
          path: 'test-results/profile-inline-student-' + width + '.png',
          fullPage: true,
        });
        await form.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.getByRole('button', { name: 'Edit Math', exact: true }).click();
        const subjectForm = page.getByRole('form', { name: 'Edit Math', exact: true });
        expect(await subjectForm.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await page.screenshot({
          path: 'test-results/profile-inline-subject-' + width + '.png',
          fullPage: true,
        });
        await subjectForm.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (index === 1)
        await page.screenshot({
          path: 'test-results/profile-overview-' + width + '.png',
          fullPage: true,
        });
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
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const identity = page.getByRole('form', { name: 'Edit student information', exact: true });
  await identity.getByLabel('Student name').fill(s.name + ' Cancelled');
  await identity.getByLabel('Grade', { exact: true }).fill('Cancelled grade');
  await identity.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await state(page)).students.find((x) => x.id === s.id)!.name).toBe(s.name);
  expect((await state(page)).operations!.students[s.id].grade).toBeUndefined();
  const before = await state(page);
  await page.getByRole('button', { name: 'Edit student information', exact: true }).click();
  await identity.getByLabel('Enrollment date', { exact: true }).fill('2026-02-01');
  await identity.getByLabel('Grade', { exact: true }).fill('Grade 3');
  await identity.getByLabel('Expected visit minutes').fill('35');
  await identity.getByRole('button', { name: 'Save student information' }).click();
  await expect(identity).toHaveCount(0);
  const saved = await state(page),
    updated = saved.operations!.students[s.id];
  expect(updated.enrollmentDate).toBe('2026-02-01');
  expect(updated.grade).toBe('Grade 3');
  expect(updated.expectedMinutes).toBe(35);
  expect(updated.subjects).toEqual(before.operations!.students[s.id].subjects);
  expect(updated.observationTiles).toEqual(['Focus, carefully']);
  expect(updated.goals).toBe('Preserve this goal');
  expect(updated.arrivalWindow).toBe('Recorded window');
  await page.getByRole('button', { name: 'Edit Math', exact: true }).click();
  const math = page.getByRole('form', { name: 'Edit Math', exact: true });
  await math.getByLabel('Math packets per homework day').fill('2');
  await math.getByRole('button', { name: 'Save Math' }).click();
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
  await identity.getByRole('button', { name: 'Save student information' }).click();
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
