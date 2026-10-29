import { test, expect } from '@playwright/test';
import { login, state, learner, command, openProfile } from './helpers';
test('inline name completion waits for a surname, confirms the matching student and keeps private APIs locked', async ({
  page,
  browser,
}) => {
  await login(page);
  const stem = 'Ari' + Date.now(),
    first = stem + ' Rivera',
    second = stem + ' Brooks';
  await command(page, 'v2', { action: 'student-add', name: first, earlyLearner: false });
  await command(page, 'v2', { action: 'student-add', name: second, earlyLearner: false });
  await page.goto('/reception');
  await page.getByRole('button', { name: 'Lock for shared use' }).click();
  await expect(page).toHaveURL(/\/kiosk$/);
  const input = page.getByLabel('Full name', { exact: true });
  await input.fill(stem);
  await page.waitForTimeout(250);
  await expect(page.locator('.name-ghost')).toHaveCount(0);
  await input.fill(stem + ' R');
  await expect(page.locator('.name-ghost')).toHaveText(first);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/arithmetica-name-completion.png',
    animations: 'disabled',
  });
  await page.keyboard.press('ArrowRight');
  await expect(input).toHaveValue(first);
  await page.getByRole('button', { name: 'Check in or out by name' }).click();
  await expect(page.getByRole('status')).toContainText(first);
  await expect(page.getByRole('status')).toContainText("You're checked in.");
  await expect(page.locator('.receipt-mark')).toBeVisible();
  await page.screenshot({
    path: 'test-results/arithmetica-confirmation.png',
    animations: 'disabled',
  });
  expect((await page.request.get('/api/state')).status()).toBe(401);
  const origin = new URL(page.url()).origin;
  const response = await page.request.post('/api/kiosk/name', {
    headers: { Origin: origin },
    data: { prefix: stem + ' B' },
  });
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(await response.json()).toEqual({ completion: second });
  expect(
    (
      await page.request.post('/api/kiosk/name', {
        headers: { Origin: 'https://foreign.example' },
        data: { prefix: stem },
      })
    ).status(),
  ).toBe(403);
  const anonymous = await browser.newContext();
  expect(
    (
      await anonymous.request.post(origin + '/api/kiosk/name', {
        headers: { Origin: origin },
        data: { prefix: stem },
      })
    ).status(),
  ).toBe(401);
  await anonymous.close();
});
test('unenrolled subjects hide all saved values and reenroll through the same compact editor', async ({
  page,
}) => {
  await login(page);
  const student = await learner(page),
    db = await state(page),
    cfg = db.operations!.students[student.id];
  cfg.subjects.Reading.enrolled = true;
  await command(page, 'v3', {
    action: 'student-save',
    studentId: student.id,
    name: student.name,
    earlyLearner: true,
    settings: cfg,
    enrollmentDate: cfg.enrollmentDate || null,
    visitDays: cfg.visitDays || [1, 3],
    tiles: cfg.observationTiles || [],
    goals: cfg.goals || '',
    arrivalWindow: cfg.arrivalWindow || '',
  });
  await openProfile(page, student.name);
  await page.getByRole('button', { name: 'Edit Math', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Math', exact: true });
  await expect(dialog.getByLabel('Worksheets per day')).toBeVisible();
  await expect(dialog.getByText(/next planned|packets per|worksheets per packet/i)).toHaveCount(0);
  await dialog.getByRole('switch', { name: 'Enrolled', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  const subjects = page.getByRole('region', { name: 'Subjects', exact: true });
  await expect(subjects.locator('dd')).toHaveText(['\u2014', '\u2014', '\u2014', '\u2014']);
  await expect(subjects.locator('dt')).toHaveText([
    'Learning mode',
    'Current level',
    'Current worksheet',
    'Worksheets per day',
  ]);
  expect((await state(page)).operations!.students[student.id].subjects.Math.level).toBe(
    cfg.subjects.Math.level,
  );
  await subjects.getByRole('button', { name: 'Add Math', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add Math', exact: true });
  await expect(add.getByRole('switch', { name: 'Enrolled', exact: true })).toBeChecked();
  await expect(add.getByLabel('Current level', { exact: true })).toHaveValue(
    cfg.subjects.Math.level,
  );
  await expect(add.getByLabel('Starting worksheet')).toHaveValue(
    String(cfg.subjects.Math.currentStart),
  );
  await add.getByRole('button', { name: 'Save changes' }).click();
  await expect(add).toHaveCount(0);
  expect((await state(page)).operations!.students[student.id].subjects.Math).toEqual(
    cfg.subjects.Math,
  );
});
test('manual pouch entry fits a phone and reduced motion retains a readable confirmation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  const student = await learner(page, 'CONNECT');
  const token = (await state(page)).students.find((s) => s.id === student.id)!.token;
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/reception');
  await page.getByRole('button', { name: 'Enter pouch code', exact: true }).click();
  await page.getByLabel('Pouch code', { exact: true }).fill(token);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Submit pouch scan', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(student.name);
  expect(
    await page.locator('.backdrop-plane').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  expect(await page.locator('.receipt-mark').evaluate((el) => getComputedStyle(el).transform)).toBe(
    'none',
  );
  await expect(page.locator('.receipt-mark')).toBeVisible();
});
