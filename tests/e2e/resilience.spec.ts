import { test, expect } from '@playwright/test';
import { login, learner, arrive, command } from './helpers';
test('failed observation save keeps the draft and displays its error inside Quick View', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page, 'CONNECT'),
    v = await arrive(page, s.id);
  await command(page, 'v3', {
    action: 'handoff',
    visitId: v.id,
    expectedAt: null,
    subjects: [],
    choices: [],
    text: '',
    followUp: false,
    correctionReason: '',
  });
  await page.reload();
  await page.locator('[data-visit-id="' + v.id + '"]').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Optional instructor note').fill('Keep this fictional unsaved draft.');
  await page.route('**/api/commands', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Fictional test server unavailable. Please retry.' }),
    }),
  );
  await dialog.getByRole('button', { name: 'Save observations', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('server unavailable');
  await expect(dialog.getByLabel('Optional instructor note')).toHaveValue(
    'Keep this fictional unsaved draft.',
  );
});
test('installed service worker gives a generic offline page without cached student data', async ({
  page,
  context,
}) => {
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your center, right now.' })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Let’s reconnect.' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Avery');
  await context.setOffline(false);
});
