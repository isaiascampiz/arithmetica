import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import {
  addInteractiveProgressStudent,
  progressStudentId,
} from '../fixtures/interactive-progress-student';
import { durationVisits, durationTotals } from '../../src/lib/center-duration';
import { addDays, weekday } from '../../src/lib/schedule';
import { dayKey, type Snapshot } from '../../src/lib/model';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 667 },
  { width: 320, height: 568 },
])
  test(
    'center duration is weighted, interactive and read-only at ' + viewport.width,
    async ({ page }) => {
      await page.setViewportSize(viewport);
      await login(page);
      const session = await state(page),
        now = new Date('2026-10-12T21:00:00Z'),
        fixture = quickViewDemo(now);
      addInteractiveProgressStudent(fixture, now);
      fixture.visits.push(
        {
          id: 'center-time-repeat-one',
          studentId: progressStudentId,
          arrivedAt: '2026-10-12T16:00:00Z',
          departedAt: '2026-10-12T16:30:00Z',
          departureVerified: true,
        },
        {
          id: 'center-time-repeat-two',
          studentId: progressStudentId,
          arrivedAt: '2026-10-12T17:00:00Z',
          departedAt: '2026-10-12T20:00:00Z',
          departureVerified: true,
        },
        {
          id: 'center-time-open',
          studentId: progressStudentId,
          arrivedAt: '2026-10-12T20:30:00Z',
          departedAt: null,
        },
        {
          id: 'center-time-unverified',
          studentId: progressStudentId,
          arrivedAt: '2026-10-12T14:00:00Z',
          departedAt: '2026-10-12T16:00:00Z',
          departureVerified: false,
        },
      );
      const snapshot: Snapshot = {
        ...fixture,
        staff: session.staff,
        timezone: fixture.operations!.center.timezone,
        runtime: { demo: true, adapter: 'local', scheduler: false },
      };
      const before = JSON.stringify(snapshot);
      const today = dayKey(now, snapshot.timezone),
        start = addDays(today, -((weekday(today) + 6) % 7) - 49);
      const expected = durationTotals(
        durationVisits(fixture, progressStudentId).filter((r) => r.day >= start && r.day <= today),
      );
      await page.clock.install({ time: now });
      await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
      let writes = 0;
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/api/commands')) writes++;
      });
      await page.goto('/?view=students&student=' + progressStudentId);
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      const card = page.getByRole('article', {
        name: 'Time spent at center',
        exact: true,
      });
      await expect(card.locator('.center-time-summary strong')).toHaveText(
        Math.round(expected.average!) + ' min',
      );
      await expect(card).not.toContainText(expected.count + ' measured visits');
      await expect(card.locator('.center-time-column')).toHaveCount(8);
      expect(
        await card
          .locator('.center-time-column')
          .first()
          .evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThan(100);
      expect(
        await card
          .locator('.center-time-grid-line')
          .first()
          .evaluate((el) => el.getBoundingClientRect().height),
      ).toBe(1);
      expect(
        await card
          .locator('.center-time-bar')
          .first()
          .evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThan(10);
      const headline = await card.locator('.center-time-summary').textContent();
      await page.getByRole('tab', { name: 'Reading', exact: true }).click();
      await expect(card.locator('.center-time-summary')).toHaveText(headline!);
      await page.screenshot({
        path: 'test-results/center-time-preview-' + viewport.width + '.png',
      });
      await card.click();
      const dialog = page.getByRole('dialog', {
        name: 'Time spent at center',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('combobox', { name: 'Duration period' })).toHaveValue(
        '8 weeks',
      );
      await expect(dialog.locator('.center-time-y-labels span').first()).toHaveText('0');
      await expect(dialog.getByRole('list', { name: 'Recorded visit history' })).not.toBeVisible();
      expect(
        await dialog.locator('.v3-modal-body').evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeLessThanOrEqual(1);
      const bar = dialog.getByRole('button', { name: /minutes average/ }).first();
      await bar.focus();
      await page.keyboard.press('Enter');
      const popup = dialog.getByRole('tooltip', {
        name: 'Visit duration summary',
      });
      await expect(popup).toBeVisible();
      await expect(dialog.locator('.progress-period > span')).not.toBeVisible();
      const firstTip = (await popup.boundingBox())!;
      await dialog.locator('.center-time-bar-target').last().focus();
      const lastTip = (await popup.boundingBox())!;
      if (viewport.width > 760) expect(lastTip.x).toBeGreaterThan(firstTip.x);
      const plotFrame = (await dialog.locator('.center-time-plot').boundingBox())!;
      expect(lastTip.x).toBeGreaterThanOrEqual(plotFrame.x - 1);
      expect(lastTip.x + lastTip.width).toBeLessThanOrEqual(plotFrame.x + plotFrame.width + 1);
      await bar.focus();
      await expect(popup).toContainText('minutes total');
      expect(await popup.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: 'test-results/center-time-detail-' + viewport.width + '.png',
      });
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(dialog).toBeVisible();
      const barBox = (await bar.boundingBox())!;
      await page.mouse.click(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
      await expect(popup).toBeVisible();
      await dialog.getByRole('heading', { name: 'Time spent at center', exact: true }).click();
      await expect(popup).toHaveCount(0);
      const period = dialog.getByRole('combobox', { name: 'Duration period' });
      await period.selectOption('1 year');
      const range = await dialog.locator('.center-time-period-nav span').innerText();
      await dialog.getByRole('button', { name: 'Previous duration period' }).click();
      await expect(dialog.locator('.center-time-period-nav span')).not.toHaveText(range);
      await dialog.getByRole('button', { name: 'Next duration period' }).click();
      await expect(dialog.locator('.center-time-period-nav span')).toHaveText(range);
      await period.selectOption('1 week');
      await expect(dialog.locator('.center-time-summary strong')).toHaveText('105 min');
      await expect(dialog.locator('.center-time-summary')).not.toContainText('2 measured visits');
      expect(
        Number(await dialog.locator('.center-time-y-labels span').last().innerText()),
      ).toBeGreaterThanOrEqual(105);
      await dialog.getByRole('button', { name: 'Previous duration period' }).click();
      await expect(dialog.locator('.center-time-column')).toHaveCount(7);
      expect(await dialog.locator('.center-time-no-visit').count()).toBeGreaterThan(0);
      await period.selectOption('1 month');
      await dialog.getByRole('button', { name: 'Previous duration period' }).click();
      await expect(dialog.locator('.center-time-chart')).toHaveAttribute('data-grouping', 'day');
      await expect(dialog.locator('.center-time-column')).toHaveCount(30);
      await period.selectOption('6 months');
      await expect(dialog.locator('.center-time-chart')).toHaveAttribute('data-grouping', 'week');
      expect(await dialog.locator('.center-time-column').count()).toBeGreaterThan(20);
      await period.selectOption('1 year');
      await expect(dialog.locator('.center-time-chart')).toHaveAttribute('data-grouping', 'month');
      await expect(dialog.locator('.center-time-column')).toHaveCount(10);
      await period.selectOption('All time');
      await dialog.getByRole('button', { name: 'Visit history', exact: true }).click();
      const history = dialog.getByRole('list', {
        name: 'Recorded visit history',
      });
      await expect(history).toBeVisible();
      await expect(history).toContainText('180 min');
      await expect(history).toContainText('Checked in');
      await expect(history).toContainText('Checked out');
      await expect(history.locator('li')).toHaveCount(
        durationVisits(fixture, progressStudentId).length,
      );
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(writes).toBe(0);
      expect(JSON.stringify(snapshot)).toBe(before);
      const empty = structuredClone(snapshot);
      empty.visits = [];
      await page.route('**/api/state', (route) => route.fulfill({ json: empty }));
      await page.reload();
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await expect(card).toContainText('No measured visits');
      await expect(card.locator('.center-time-no-visit')).toHaveCount(8);
      await expect(card.locator('.center-time-bar')).toHaveCount(0);
      await card.click();
      await dialog.getByRole('button', { name: 'Visit history', exact: true }).click();
      await expect(dialog.locator('.center-time-history')).toContainText(
        'No measured visits in this period.',
      );
      expect(writes).toBe(0);
    },
  );
