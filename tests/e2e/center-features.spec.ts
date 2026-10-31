import { test, expect } from '@playwright/test';
import { login, state, learner, arrive, command } from './helpers';
import { centerFeatures } from '../../src/lib/center-features';

for (const width of [1024, 390])
  test(
    'owner rollout settings preserve data and simplify Quick View and profiles at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      let db = await state(page);
      await command(page, 'v3', {
        action: 'center-features',
        expectedVersion: centerFeatures(db).version,
        homework: true,
        medals: true,
        resumeReviewed: true,
      });
      const s = await learner(page);
      await command(page, 'v2', {
        action: 'achievement',
        studentId: s.id,
        subject: 'Math',
        distinction: 'Silver',
        date: '2026-10-01',
        evidence: '',
      });
      const visit = await arrive(page, s.id);
      await page.goto('/?view=settings');
      const settings = page.getByRole('dialog', {
        name: 'Settings',
        exact: true,
      });
      await expect(settings.getByRole('switch', { name: 'Achievement medals' })).toHaveCount(0);
      await settings.getByRole('switch', { name: 'Homework', exact: true }).click();
      await expect(
        settings.getByRole('switch', { name: 'Homework', exact: true }),
      ).not.toBeChecked();
      db = await state(page);
      expect(centerFeatures(db).homework).toBe(false);
      expect(centerFeatures(db).medals).toBe(true);
      const before = JSON.stringify(db.operations!.assignments),
        cursor = structuredClone(db.operations!.students[s.id].subjects);
      const medals = structuredClone(db.operations!.achievements);
      await page.reload();
      await expect(
        settings.getByRole('switch', { name: 'Homework', exact: true }),
      ).not.toBeChecked();
      await expect(page.getByRole('heading', { name: 'Curriculum boundaries' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Homework Preparation/ })).toHaveCount(0);
      await page.goto('/?view=homework');
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await page.locator('[data-visit-id="' + visit.id + '"]').click();
      const quick = page.getByRole('dialog');
      await expect(quick.getByRole('heading', { name: 'In-center activity' })).toBeVisible();
      for (const heading of ['Incoming homework', 'In-center work', 'Outgoing homework'])
        await expect(quick.getByRole('heading', { name: heading, exact: true })).toHaveCount(0);
      await expect(quick.locator('.packet-chip')).toHaveCount(0);

      await quick.getByRole('button', { name: 'Both', exact: true }).click();
      await quick.getByRole('button', { name: 'Focus: 5 out of 5', exact: true }).click();
      await quick.locator('textarea').fill('Fictional rollout activity note.');
      await page.screenshot({
        path: 'test-results/rollout-quick-' + width + '.png',
      });
      await quick.getByRole('button', { name: 'Check in Math', exact: true }).click();
      await expect(quick).toHaveCount(0);
      const after = await state(page),
        saved = after.visits.find((v) => v.id === visit.id)!;
      expect(JSON.stringify(after.operations!.assignments)).toBe(before);
      expect(after.operations!.students[s.id].subjects).toEqual(cursor);
      expect(after.operations!.achievements).toEqual(medals);
      expect(saved.arrivedAt).toBe(visit.arrivedAt);
      expect(saved.departedAt).toBeNull();
      expect(saved.sessionRecords!.at(-1)!.mode).toBe('activity-only');
      expect(saved.sessionRecords!.at(-1)!.activity).toBe('Both');
      expect(after.observations.find((o) => o.visitId === visit.id)!.skillRatings![0].score).toBe(
        5,
      );
      await page.goto('/?view=students&student=' + s.id);
      await expect(
        page.getByRole('img', {
          name: 'Current Math Silver achievement medal',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText('Packets per homework day', { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await expect(page.locator('.progress-grid > article')).toHaveCount(2);
      await expect(
        page.getByRole('article', {
          name: 'Time spent at center',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole('article', { name: 'Skill ratings', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Visit History', exact: true }).click();
      await page.getByRole('button', { name: 'View session', exact: true }).first().click();
      const past = page.getByRole('dialog');
      await expect(past.getByRole('heading', { name: 'In-center activity' })).toBeVisible();
      await expect(past).toContainText('Both');
      await expect(past).toContainText('Fictional rollout activity note.');
      await expect(past.getByRole('heading', { name: 'Homework received' })).toHaveCount(0);
      await expect(past.getByRole('heading', { name: 'Homework sent home' })).toHaveCount(0);
      await page.goto('/?view=settings');
      await settings.getByRole('switch', { name: 'Homework', exact: true }).click();
      const resume = page.getByRole('dialog', {
        name: 'Turn on homework',
        exact: true,
      });
      await expect(resume.getByRole('button', { name: 'Turn on', exact: true })).toBeDisabled();
      await resume.getByRole('switch', { name: 'Levels and plans reviewed', exact: true }).click();
      await resume.getByRole('button', { name: 'Turn on', exact: true }).click();
      await expect(resume).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Homework Preparation/ })).toHaveCount(1);
      await page.goto('/?view=students&student=' + s.id);
      await expect(
        page.getByRole('img', {
          name: 'Current Math Silver achievement medal',
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await expect(page.locator('.progress-grid > article')).toHaveCount(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    },
  );

test('instructors and assistants cannot change rollout settings through UI or API', async ({
  browser,
  page,
}) => {
  await login(page);
  const db = await state(page);
  for (const role of ['instructor', 'assistant']) {
    const context = await browser.newContext(),
      staff = await context.newPage();
    await login(staff, role);
    await staff.goto('/?view=settings');
    await expect(staff.getByRole('region', { name: 'Center features' })).toHaveCount(0);
    const response = await staff.request.post('/api/commands', {
      headers: { Origin: new URL(staff.url()).origin },
      data: {
        kind: 'v3',
        requestId: crypto.randomUUID(),
        command: {
          action: 'center-features',
          expectedVersion: centerFeatures(db).version,
          homework: false,
          medals: false,
        },
      },
    });
    expect(response.status()).toBe(403);
    await context.close();
  }
  expect(centerFeatures(await state(page))).toEqual(centerFeatures(db));
});
