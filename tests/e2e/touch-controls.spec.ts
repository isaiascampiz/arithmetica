import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

for (const theme of ['Dark', 'Light'])
  test(`touch controls retain their ${theme.toLowerCase()} theme after a failed save`, async ({
    page,
  }) => {
    await login(page);
    expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false);
    await page.getByRole('button', { name: 'Theme', exact: true }).tap();
    await page.getByRole('menuitemradio', { name: theme, exact: true }).tap();
    await page.goto('/?view=students');
    await page.getByRole('button', { name: 'Add student', exact: true }).tap();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('New fictional student name', { exact: true })
      .fill('Fictional Touch Review');
    await page.route('**/api/commands', (route) =>
      route.fulfill({
        status: 503,
        json: { error: 'Fictional save unavailable. Retry.' },
      }),
    );
    const save = dialog.getByRole('button', { name: 'Create student', exact: true });
    const original = await save.evaluate((el) => getComputedStyle(el).backgroundColor);
    await save.tap();
    await expect(dialog.getByRole('alert')).toContainText('Fictional save unavailable');
    await expect(save).toBeEnabled();
    await expect(save).toHaveCSS('background-color', original);
    await page.screenshot({
      path: `test-results/release-touch-${theme.toLowerCase()}.png`,
      animations: 'disabled',
    });
  });
