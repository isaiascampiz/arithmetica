import { test, expect } from '@playwright/test';
import { login, state, learner, arrive, physical, openProfile, command } from './helpers';
test('instructor notes and existing follow-up survive checkout/reload and review', async ({
  page,
}) => {
  await login(page, 'instructor');
  const s = await learner(page, 'CONNECT'),
    v = await arrive(page, s.id);
  const existingFollowUp = 'Existing fictional follow-up ' + Date.now();
  await command(page, 'v3', {
    action: 'observation',
    visitId: v.id,
    choices: [],
    text: existingFollowUp,
    followUp: true,
  });
  await page.reload();
  await page.locator('[data-visit-id="' + v.id + '"]').click();
  const dialog = page.getByRole('dialog');
  const note = 'Fictional regression observation ' + Date.now();
  await dialog.getByLabel('Optional instructor note').fill(note);
  await expect(dialog.getByLabel('Follow-up needed')).toHaveCount(0);
  await dialog.getByRole('button', { name: /Check in (Math|Reading)/ }).click();
  await expect(dialog).toHaveCount(0);
  await physical(page, s.id, 'out');
  await page.reload();
  await openProfile(page, s.name);
  await page.getByRole('button', { name: 'Visit History', exact: true }).click();
  const newNote = page.locator('.history-note').filter({ hasText: note });
  await expect(newNote).toBeVisible();
  await expect(newNote).not.toContainText('Follow-up');
  const card = page.locator('.history-note').filter({ hasText: existingFollowUp });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Follow-up');
  await card.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(card).toContainText('Reviewed');
  await page.reload();
  await page.getByRole('button', { name: 'Visit History', exact: true }).click();
  await expect(page.locator('.history-note').filter({ hasText: existingFollowUp })).toContainText(
    'Reviewed',
  );
});
test('kiosk manual flow is idempotent and cannot read staff records', async ({ page }) => {
  await login(page);
  const s = await learner(page, 'CONNECT'),
    db = await state(page),
    token = db.students.find((x) => x.id === s.id)!.token;
  await page.getByRole('button', { name: 'Open kiosk', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'SCAN YOUR POUCH' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter a pouch code instead' }).click();
  await page.getByLabel('Student pouch code').fill(token);
  await page.getByRole('button', { name: 'Submit pouch scan' }).click();
  await expect(page.getByRole('status')).toContainText('checked in');
  expect((await page.request.get('/api/state')).status()).toBe(401);
  await page.getByRole('button', { name: 'Ready for the next student' }).click();
  await page.getByLabel('Student pouch code').fill(token);
  await page.getByRole('button', { name: 'Submit pouch scan' }).click();
  await expect(page.getByRole('status')).toContainText('Scan already recorded');
  await page.waitForTimeout(31000); // Real server debounce interval.
  await page.getByLabel('Student pouch code').fill(token);
  await page.getByRole('button', { name: 'Submit pouch scan' }).click();
  await expect(page.getByRole('status')).toContainText('checked out');
  await page.getByRole('button', { name: 'Ready for the next student' }).click();
  await page.getByLabel('Student pouch code').fill('invalid-code');
  await page.getByRole('button', { name: 'Submit pouch scan' }).click();
  await expect(page.locator('.kiosk-error')).toContainText('not recognized');
});
test('assistant instruction access denied; legacy packet transitions still persist and are retained in history', async ({
  page,
}) => {
  await login(page, 'assistant');
  await expect(page.getByRole('button', { name: 'Reports', exact: true })).toHaveCount(0);
  const db = await state(page);
  expect(db.observations).toEqual([]);
  const denied = await page.request.post('/api/commands', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      kind: 'observation',
      studentId: db.students[0].id,
      choices: ['Strong focus'],
      text: '',
      followUp: false,
    },
  });
  expect(denied.status()).toBe(403);
  expect((await page.request.get('/api/export')).status()).toBe(403);
  const description = 'Fictional retained packet ' + Date.now();
  expect(
    (
      await page.request.post('/api/commands', {
        headers: { Origin: 'http://127.0.0.1:3100' },
        data: { kind: 'homework', studentId: db.students[1].id, description },
      })
    ).ok(),
  ).toBe(true);
  const packet = (await state(page)).homework.find((h) => h.description === description)!;
  for (const status of ['prepared', 'handed-off'])
    expect(
      (
        await page.request.post('/api/commands', {
          headers: { Origin: 'http://127.0.0.1:3100' },
          data: { kind: 'homework-status', id: packet.id, status },
        })
      ).ok(),
    ).toBe(true);
  await page.reload();
  await openProfile(page, db.students[1].name);
  await page.getByRole('button', { name: 'Visit History', exact: true }).click();
  await page.getByText('Preserved V1/V2 worksheet and decision history', { exact: true }).click();
  await expect(page.locator('.historical-v3').filter({ hasText: description })).toContainText(
    'handed-off',
  );
});
test('camera-denial fallback, tablet/phone layout and modal Escape remain usable', async ({
  page,
}) => {
  await login(page);
  const box = await page.getByRole('button', { name: 'Sign out' }).boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  await page.screenshot({ path: 'test-results/v3-ipad.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await page.getByRole('button', { name: 'Add student', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/v3-phone-roster.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Open kiosk', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'SCAN YOUR POUCH' })).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      configurable: true,
    }),
  );
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.locator('.kiosk-error')).toContainText('Camera could not start');
  await expect(page.getByLabel('Student pouch code')).toBeEnabled();
  await page.screenshot({ path: 'test-results/v3-phone-kiosk.png', fullPage: true });
});
test('anonymous access and foreign-origin writes remain denied', async ({ page }) => {
  expect((await page.request.get('/api/state')).status()).toBe(401);
  expect((await page.request.get('/api/export')).status()).toBe(401);
  await page.goto('/kiosk');
  await expect(page.getByRole('heading', { name: 'Let’s set up reception.' })).toBeVisible();
  const r = await page.request.post('/api/auth', {
    headers: { Origin: 'https://untrusted.example' },
    data: { email: 'owner@demo.center', password: 'CenterDemo!2026' },
  });
  expect(r.status()).toBe(403);
  await page.goto('/');
  await expect(page).toHaveURL(/login/);
});
