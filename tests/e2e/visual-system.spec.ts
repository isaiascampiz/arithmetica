import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';

test.use({ hasTouch: true });

test('settings keeps failed-save feedback inside its accessible dialog', async ({ page }) => {
  await login(page);
  await page.goto('/?view=settings');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Center details' })
    .click();
  await settings.getByRole('button', { name: 'Change', exact: true }).first().click();
  const editor = page.getByRole('dialog', { name: 'Center details', exact: true });
  await editor.getByLabel('Closing time').fill('19:30');
  await page.route('**/api/commands', (route) =>
    route.fulfill({ status: 409, json: { error: 'Fictional stale settings. Refresh and retry.' } }),
  );
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Fictional stale settings');
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});

for (const size of [
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
]) {
  test(`Arithmetica identity and existing screens remain usable at ${size.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await login(page);
    const session = await state(page);
    const now = new Date('2026-10-19T23:35:00Z');
    const fixture = quickViewDemo(now);
    fixture.operations!.center.name = 'Willow Learning Center';
    await page.clock.install({ time: now });
    await page.route('**/api/state', (route) =>
      route.fulfill({
        json: {
          ...fixture,
          staff: session.staff,
          timezone: fixture.operations!.center.timezone,
          runtime: { demo: true, adapter: 'local', scheduler: false },
        },
      }),
    );
    for (const view of ['home', 'students', 'homework', 'activity', 'reports', 'settings']) {
      await page.goto('/?view=' + view);
      if (view === 'settings') {
        await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
      } else {
        await expect(page.locator('.sidebar .brand')).toHaveText('Arithmetica');
        await expect(page.locator('.v3-content h1')).toBeVisible();
      }
      if (view === 'reports')
        await expect(page.locator('.report-metric-tabs button')).toHaveCount(4);
      await page.evaluate(() => document.fonts.ready);
      if (view === 'students')
        expect(
          await page
            .getByLabel('Search Student Roster')
            .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
        ).toBeGreaterThanOrEqual(16);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain(
        'interfaceFont',
      );
      await page.screenshot({
        path: `test-results/arithmetica-${view}-${size.width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
    await page.goto('/?view=students');
    const add = page.getByRole('button', { name: 'Add student', exact: true });
    await add.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: `test-results/arithmetica-dialog-${size.width}.png`,
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(add).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await add.click();
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((el) =>
        el
          .getAnimations()
          .every((animation) =>
            (animation.effect as KeyframeEffect)
              .getKeyframes()
              .every((frame) => frame.transform === 'none'),
          ),
      ),
    ).toBe(true);
    await dialog.getByRole('button', { name: 'Close panel' }).click();
    await expect(dialog).toHaveCount(0);
    await page.goto('/?view=students&student=' + fixture.students[0].id);
    await expect(
      page.getByRole('heading', { name: fixture.students[0].name, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/arithmetica-profile-${size.width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('navigation', { name: 'Settings sections' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: fixture.students[0].name, exact: true }),
    ).toBeVisible();
    for (const section of ['Progress', 'Visit History']) {
      await page.getByRole('button', { name: section, exact: true }).click();
      await expect(page.locator('.profile-v3')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `test-results/arithmetica-profile-${section.replace(' ', '-').toLowerCase()}-${size.width}.png`,
        fullPage: true,
      });
    }
  });
}
