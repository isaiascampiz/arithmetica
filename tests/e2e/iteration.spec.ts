import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import { isOpenVisit } from '../../src/lib/model';

for (const width of [1024, 768, 390])
  test(
    'directory controls, compact packets and profile identity stay consistent at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      const session = await state(page),
        now = new Date('2026-10-19T23:35:00Z'),
        fixture = quickViewDemo(now);
      await page.clock.install({ time: now });
      await page.route('**/api/state', (route) =>
        route.fulfill({
          json: { ...fixture, staff: session.staff, timezone: fixture.operations!.center.timezone },
        }),
      );
      const positions: { sort: number; filter: number }[] = [],
        options: string[][] = [];
      for (const view of ['students', 'homework']) {
        await page.goto('/?view=' + view);
        const toolbar = page.locator('.student-directory-toolbar');
        const sort = toolbar.getByRole('button', { name: 'Sort by', exact: true }),
          filter = toolbar.getByRole('button', { name: 'Filters', exact: true });
        positions.push({
          sort: (await sort.boundingBox())!.x,
          filter: (await filter.boundingBox())!.x,
        });
        await sort.click();
        options.push(await page.getByRole('menuitemradio').allTextContents());
        await page.keyboard.press('Escape');
        await filter.click();
        const dialog = page.getByRole('dialog', { name: 'Filter students', exact: true });
        await expect(dialog.getByRole('combobox')).toHaveCount(2);
        await expect(
          dialog.getByRole('switch', { name: 'Early learner', exact: true }),
        ).toBeVisible();
        await dialog.getByLabel('Subject', { exact: true }).selectOption('Reading');
        await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
        if (view === 'homework') {
          await expect(
            page.getByRole('region', { name: 'Math preparation', exact: true }),
          ).toHaveCount(0);
          const student = fixture.students.find((s) => s.subjects.length === 1)!;
          await page
            .getByRole('button', { name: 'Open profile for ' + student.name, exact: true })
            .click();
          await expect(
            page.getByRole('heading', { name: student.name, exact: true }),
          ).toBeVisible();
          const title = await page.locator('.profile-heading-copy h1').boundingBox(),
            meta = await page.locator('.profile-heading-copy > span').boundingBox();
          expect(title!.x).toBe(meta!.x);
          expect(meta!.y).toBeGreaterThan(title!.y);
        }
      }
      expect(positions[0]).toEqual(positions[1]);
      expect(options[0]).toEqual(options[1]);
      await page.goto('/');
      await expect(page.locator('.home-preparation-state')).toHaveCount(3);
      await page.screenshot({
        path: 'test-results/iteration-home-' + width + '.png',
        fullPage: true,
        animations: 'disabled',
      });
      const visit = fixture.visits.find(
        (v) => v.studentId === fixture.students[0].id && isOpenVisit(v),
      )!;
      await page.locator('[data-visit-id="' + visit.id + '"]').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/Checking in confirms/)).toHaveCount(0);
      await expect(dialog.locator('footer')).toHaveCount(0);
      const action = dialog.getByRole('button', { name: 'Check in Math', exact: true });
      const actionTop = await action.evaluate((el) => el.getBoundingClientRect().top),
        bodyBottom = await dialog
          .locator('.v3-modal-body')
          .evaluate((el) => el.getBoundingClientRect().bottom);
      expect(actionTop).toBeGreaterThan(bodyBottom);
      await dialog.getByRole('button', { name: 'Corrections', exact: true }).click();
      const packets = dialog.locator(
        '.quick-outgoing-cards .packet-chip, .quick-held-packets .held-packet',
      );
      for (const packet of await packets.all()) {
        const box = (await packet.boundingBox())!;
        expect(box.width).toBeLessThanOrEqual(108);
        expect(box.height).toBeLessThanOrEqual(64);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      await page.screenshot({
        path: 'test-results/iteration-quick-' + width + '.png',
        fullPage: true,
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await page.goto('/?view=students&student=' + fixture.students[0].id);
      await page.screenshot({
        path: 'test-results/iteration-profile-' + width + '.png',
        fullPage: true,
        animations: 'disabled',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    },
  );
