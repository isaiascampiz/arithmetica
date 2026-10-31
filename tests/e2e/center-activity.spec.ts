import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { seed } from '../../src/lib/seed';
import { migrateV3 } from '../../src/lib/v3-migrate';
import { addFictionalCenterActivity } from '../fixtures/center-activity-demo';
import { dailyTrafficBins } from '../../src/lib/center-attendance';
import { arrivalComparison } from '../../src/lib/center-arrivals';
import { activitySettings } from '../../src/lib/activity-settings';

test('dark is the default and the theme control retains the chosen appearance', async ({
  page,
}) => {
  await login(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Theme', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

for (const size of [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`Center Activity overlay, history and settings fit ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await login(page);
    const session = await state(page),
      now = new Date('2026-10-19T23:35:00Z');
    const db = seed(now);
    migrateV3(db, now);
    addFictionalCenterActivity(db, now);
    const snapshot = {
      ...db,
      staff: session.staff,
      timezone: db.operations!.center.timezone,
    };
    await page.clock.install({ time: now });
    await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
    await page.goto('/?view=activity');
    const panel = page.locator('.activity-comparison');
    await expect(page.getByRole('heading', { name: 'Traffic', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Monthly', exact: true })).toBeVisible();
    const result = arrivalComparison(db, '2026-10-19', 'Daily', now, true);
    await expect(panel.locator('.traffic-stat-group:first-child .recorded-stat dd')).toHaveText(
      String(result.total),
    );
    const plotted = dailyTrafficBins(result.bins);
    await expect(panel.locator('.activity-expected-bar')).toHaveCount(plotted.length);
    await expect(panel.locator('.attendance-column')).toHaveCount(8);
    expect(
      await panel
        .locator('.attendance-chart-viewport')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await expect(panel.locator('.attendance-column-label .hour-full')).toHaveText([
      '12 PM',
      '1 PM',
      '2 PM',
      '3 PM',
      '4 PM',
      '5 PM',
      '6 PM',
      '7 PM',
    ]);
    await expect(panel.locator('table tbody tr')).toHaveCount(24);
    await expect(page.getByRole('button', { name: 'Punch history', exact: true })).toHaveCount(0);
    await expect(panel.locator('.attendance-y-axis span')).toHaveCount(5);
    const plot = panel.getByRole('slider', {
      name: 'Inspect check-ins by period',
    });
    await plot.focus();
    const position = Number(await plot.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowRight');
    await expect(plot).toHaveAttribute(
      'aria-valuenow',
      String(Math.min(position + 1, plotted.length - 1)),
    );
    const column = panel
      .locator('.attendance-column')
      .filter({ has: page.locator('.activity-expected-bar') })
      .first();
    const expectedBar = await column.locator('.activity-expected-bar').boundingBox(),
      actualBar = await column.locator('.activity-actual-bar').boundingBox();
    if (expectedBar && actualBar) {
      expect(expectedBar.x).toBeCloseTo(actualBar.x, 0);
      expect(expectedBar.width).toBeCloseTo(actualBar.width, 0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await plot.blur();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: 'test-results/traffic-daily-' + size.width + '.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Weekly', exact: true }).click();
    await expect(panel.locator('.attendance-column')).toHaveCount(7);
    await expect(panel.locator('.traffic-summary')).toContainText('Selected week');
    await page.getByRole('button', { name: 'Monthly', exact: true }).click();
    await expect(panel.locator('.attendance-column')).toHaveCount(31);
    await expect(panel.locator('.activity-expected-bar')).toHaveCount(0);
    await page.getByLabel('Search check-ins').fill(db.students[0].name);
    await expect(page.getByLabel('Search check-ins')).toHaveCSS('border-top-width', '0px');
    await panel.locator('.attendance-punches > summary').click();
    await expect(panel.locator('.activity-punch summary b').first()).toHaveText(
      db.students[0].name,
    );
    await page.getByRole('button', { name: 'Yearly', exact: true }).click();
    await expect(panel.locator('.attendance-column')).toHaveCount(12);
    await expect(panel.locator('.activity-expected-bar')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: 'test-results/arithmetica-attendance-' + size.width + '.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByLabel('Search check-ins').fill('No fictional match');
    await expect(panel.locator('.traffic-stat-group:first-child .recorded-stat dd')).toHaveText(
      '0',
    );
    await expect(panel.locator('.activity-punch')).toHaveCount(0);
    await page.goto('/?view=settings');
    const settings = page.getByRole('dialog', {
      name: 'Settings',
      exact: true,
    });
    await expect(settings.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
    await expect(settings.getByRole('switch', { name: 'Homework', exact: true })).toBeVisible();
    await expect(settings.getByText('Center Activity hours', { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: `test-results/activity-settings-${size.width}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('instructor saves per-day reporting hours durably and assistants cannot change them', async ({
  page,
}) => {
  await login(page, 'instructor');
  const before = await state(page),
    settings = activitySettings(before);
  const requestId = crypto.randomUUID();
  const payload = {
    kind: 'v3',
    requestId,
    command: {
      action: 'activity-hours',
      expectedVersion: settings.version,
      days: settings.days.map((d) => ({
        ...d,
        start: d.day === 2 ? 10 : d.start,
      })),
    },
  };
  const post = () =>
    page.request.post('/api/commands', {
      headers: { Origin: new URL(page.url()).origin },
      data: payload,
    });
  expect((await post()).ok()).toBe(true);
  expect((await post()).ok()).toBe(true);
  const after = await state(page);
  expect(activitySettings(after).version).toBe(settings.version + 1);
  expect(activitySettings(after).days.find((d) => d.day === 2)!.start).toBe(10);
  expect(after.visits).toEqual(before.visits);
  expect(after.operations!.assignments).toEqual(before.operations!.assignments);
  payload.requestId = crypto.randomUUID();
  expect((await post()).status()).toBe(409);
  await login(page, 'assistant');
  payload.requestId = crypto.randomUUID();
  payload.command.expectedVersion++;
  expect((await post()).status()).toBe(403);
});
