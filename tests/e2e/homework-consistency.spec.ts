import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import {
  addInteractiveProgressStudent,
  progressStudentId,
} from '../fixtures/interactive-progress-student';
import { addFictionalHomeworkReviews } from '../fixtures/homework-consistency-demo';
import { homeworkReviews, homeworkTotals } from '../../src/lib/homework-consistency';
import { addDays, weekday } from '../../src/lib/schedule';
import { dayKey, type Snapshot } from '../../src/lib/model';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 667 },
  { width: 320, height: 568 },
])
  test(
    'homework consistency is weighted, interactive and read-only at ' + viewport.width,
    async ({ page }) => {
      await page.setViewportSize(viewport);
      await login(page);
      const session = await state(page),
        now = new Date('2026-10-12T21:00:00Z'),
        fixture = quickViewDemo(now);
      addInteractiveProgressStudent(fixture, now);
      addFictionalHomeworkReviews(fixture, now);
      const snapshot: Snapshot = {
        ...fixture,
        staff: session.staff,
        timezone: fixture.operations!.center.timezone,
        runtime: { demo: true, adapter: 'local', scheduler: false },
      };
      const before = JSON.stringify(snapshot);
      const today = dayKey(now, snapshot.timezone),
        start = addDays(today, -((weekday(today) + 6) % 7) - 49);
      const expected = homeworkTotals(
        homeworkReviews(fixture, progressStudentId, 'Math').filter(
          (r) => r.day >= start && r.day <= today,
        ),
      );
      await page.clock.install({ time: now });
      await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
      let writes = 0;
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/api/commands')) writes++;
      });
      await page.goto('/?view=students&student=' + progressStudentId);
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      const card = page.getByRole('article', { name: 'Homework consistency', exact: true });
      await expect(card.locator('.homework-summary strong')).toHaveText(
        Math.round(expected.percent!) + '%',
      );
      await expect(card).toContainText(expected.completed + ' of ' + expected.total + ' packets');
      await expect(card.locator('.homework-column')).toHaveCount(8);
      expect(await card.locator('.homework-no-review').count()).toBeGreaterThan(0);
      await page.screenshot({ path: 'test-results/homework-preview-' + viewport.width + '.png' });
      await card.click();
      const dialog = page.getByRole('dialog', { name: 'Homework consistency', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('combobox', { name: 'Homework period' })).toHaveValue(
        '3 months',
      );
      await expect(dialog.locator('.homework-y-labels span')).toHaveText([
        '0%',
        '25%',
        '50%',
        '75%',
        '100%',
      ]);
      await expect(
        dialog.getByRole('list', { name: 'Recorded homework history' }),
      ).not.toBeVisible();
      expect(
        await dialog.locator('.v3-modal-body').evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeLessThanOrEqual(1);
      const bar = dialog.getByRole('button', { name: /% completed/ }).first();
      await bar.focus();
      await page.keyboard.press('Enter');
      const popup = dialog.getByRole('tooltip', { name: 'Homework review summary' });
      await expect(popup).toBeVisible();
      await expect(popup).toContainText('packets');
      expect(await popup.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: 'test-results/homework-detail-' + viewport.width + '.png' });
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(dialog).toBeVisible();
      const barBox = (await bar.boundingBox())!;
      await page.mouse.click(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
      await expect(popup).toBeVisible();
      await dialog.getByRole('heading', { name: 'Homework consistency', exact: true }).click();
      await expect(popup).toHaveCount(0);
      const period = dialog.getByRole('combobox', { name: 'Homework period' });
      await period.selectOption('1 year');
      const range = await dialog.locator('.homework-period-nav span').innerText();
      await dialog.getByRole('button', { name: 'Previous homework period' }).click();
      await expect(dialog.locator('.homework-period-nav span')).not.toHaveText(range);
      await dialog.getByRole('button', { name: 'Next homework period' }).click();
      await expect(dialog.locator('.homework-period-nav span')).toHaveText(range);
      await period.selectOption('1 week');
      await expect(dialog.locator('.homework-summary strong')).toHaveText('\u2014');
      await dialog.getByRole('button', { name: 'Previous homework period' }).click();
      await expect(dialog.locator('.homework-column')).toHaveCount(7);
      expect(await dialog.locator('.homework-no-review').count()).toBeGreaterThan(0);
      await period.selectOption('All time');
      await dialog.getByRole('button', { name: 'Homework history', exact: true }).click();
      const history = dialog.getByRole('list', { name: 'Recorded homework history' });
      await expect(history).toBeVisible();
      await expect(history).toContainText('Unfinished');
      await expect(history).toContainText('Completed');
      await expect(history).toContainText('Fictional Demo Instructor');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await page.goto('/?view=students&student=' + fixture.students[1].id);
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await page.getByRole('tab', { name: 'Reading', exact: true }).click();
      await expect(
        page.getByRole('article', { name: 'Homework consistency', exact: true }),
      ).toContainText('Kumon CONNECT');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(writes).toBe(0);
      expect(JSON.stringify(snapshot)).toBe(before);
    },
  );
