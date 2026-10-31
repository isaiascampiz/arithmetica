import { test, expect } from '@playwright/test';
import { login, learner, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import { isOpenVisit } from '../../src/lib/model';

test('Quick View keeps held packet geometry, unboxed subject rails and readable activity states in both themes', async ({
  page,
}) => {
  await login(page);
  const session = await state(page),
    now = new Date('2026-10-19T23:35:00Z'),
    fixture = quickViewDemo(now);
  await page.clock.install({ time: now });
  await page.route('**/api/state', (route) =>
    route.fulfill({
      json: {
        ...fixture,
        staff: session.staff,
        timezone: fixture.operations!.center.timezone,
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sync students', exact: true })).toBeVisible();
  let refreshes = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/api/state')) refreshes++;
  });
  await page.getByRole('button', { name: 'Sync students', exact: true }).click();
  await expect.poll(() => refreshes).toBeGreaterThan(0);
  const visit = fixture.visits.find(
    (v) => v.studentId === fixture.students[0].id && isOpenVisit(v),
  )!;
  for (const theme of ['dark', 'light']) {
    await page.getByRole('button', { name: 'Theme', exact: true }).click();
    await page
      .getByRole('menuitemradio', {
        name: theme === 'dark' ? 'Dark' : 'Light',
        exact: true,
      })
      .click();
    await page.locator('[data-visit-id="' + visit.id + '"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('tab', { name: 'Math', exact: true })).toBeVisible();
    await expect(dialog.locator('.quick-subject-tabs')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    const background = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(dialog.locator('.quick-pinned-context')).toHaveCSS('background-color', background);
    await dialog.getByRole('button', { name: 'Corrections', exact: true }).click();
    const selected = dialog.getByRole('button', {
      name: 'Corrections',
      exact: true,
    });
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(
      await selected.evaluate(
        (el) => getComputedStyle(el).color !== getComputedStyle(el).backgroundColor,
      ),
    ).toBe(true);
    const held = dialog.locator('.held-packet').first(),
      outgoing = dialog.locator('.quick-outgoing-cards .packet-chip').first();
    await expect(held).toBeVisible();
    const a = (await held.boundingBox())!,
      b = (await outgoing.boundingBox())!;
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    await expect(held.locator('span')).toHaveCSS('text-decoration-line', 'line-through');
    await page.screenshot({
      path: 'test-results/arithmetica-quick-' + theme + '.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('keyboard QR reader records attendance with name entry visible and keeps the public kiosk isolated', async ({
  page,
}) => {
  await login(page);
  const student = await learner(page, 'CONNECT'),
    token = (await state(page)).students.find((s) => s.id === student.id)!.token;
  await page.goto('/reception');
  await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await page.getByRole('link', { name: 'Arithmetica home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.goto('/reception');
  await page.getByRole('button', { name: 'Lock for shared use', exact: true }).click();
  await expect(page).toHaveURL(/\/kiosk$/);
  await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
  await page.getByLabel('Full name', { exact: true }).focus();
  await page.keyboard.type(token, { delay: 10 });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('checked in');
  expect((await page.request.get('/api/state')).status()).toBe(401);
  expect((await page.request.get('/api/kiosk')).status()).toBe(200);
  await page.getByRole('button', { name: 'Ready for the next student', exact: true }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('');
  await page.screenshot({
    path: 'test-results/arithmetica-reception.png',
    fullPage: true,
    animations: 'disabled',
  });
});
