import { test, expect } from '@playwright/test';
import { login, state, learner } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';

test('Home checks in an expected student directly and the wordmark stays passive', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }),
  );
  await login(page);
  const session = await state(page),
    now = new Date('2026-10-19T20:00:00Z'),
    fixture = quickViewDemo(now),
    student = fixture.students[0];
  fixture.visits = fixture.visits.filter((v) => v.studentId !== student.id);
  fixture.operations!.students[student.id].visitDays = [1];
  fixture.operations!.students[student.id].recurringDays = [1];
  await page.clock.install({ time: now });
  await page.route('**/api/state', (route) =>
    route.fulfill({
      json: { ...fixture, staff: session.staff, timezone: fixture.operations!.center.timezone },
    }),
  );
  let command: Record<string, unknown> | null = null;
  await page.route('**/api/commands', async (route) => {
    command = route.request().postDataJSON();
    fixture.visits.push({
      id: 'direct-home-checkin',
      studentId: student.id,
      arrivedAt: now.toISOString(),
      departedAt: null,
    });
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await expect(page.locator('.sidebar .brand')).toHaveText('Arithmetica');
  await expect(page.locator('.sidebar .brand')).not.toHaveAttribute('href');
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Still expected/ }).click();
  const expected = page.locator('[data-expected-student-id="' + student.id + '"]');
  await expect(expected).toContainText('Not arrived');
  await expected.getByRole('button', { name: 'Check in ' + student.name, exact: true }).click();
  await expect(expected).toHaveCount(0);
  expect(command).toMatchObject({ kind: 'attendance', studentId: student.id, direction: 'in' });
});

test('roster sorts through a menu and filters use only purposeful controls', async ({ page }) => {
  await login(page);
  await page.goto('/?view=students');
  await page.getByRole('button', { name: 'Sort by', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Name (Z-A)', exact: true }).click();
  const names = await page.locator('.roster-v3-person b').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const filters = page.getByRole('dialog', { name: 'Filter students', exact: true });
  await expect(filters.getByLabel('Enrollment status', { exact: true })).toHaveCount(0);
  await expect(filters.getByRole('combobox')).toHaveCount(2);
  await filters.getByRole('switch', { name: 'Early learner', exact: true }).click();
  await filters.getByRole('button', { name: 'Tue', exact: true }).click();
  await expect(filters.getByRole('button', { name: 'Tue', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await filters.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(filters).toHaveCount(0);
});

test('theme menus share one preference and System follows device appearance', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'System', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings.getByRole('button', { name: 'Theme', exact: true })).toHaveText('System');
  await settings.getByRole('button', { name: 'Theme', exact: true }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('account edits preserve attribution, reject stale updates and guard the only owner', async ({
  page,
}) => {
  await login(page);
  const before = await state(page);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Account', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  await settings.getByLabel('First name', { exact: true }).fill('Fictional');
  await settings.getByLabel('Last name', { exact: true }).fill('Owner');
  await settings
    .getByLabel('Profile picture file', { exact: true })
    .setInputFiles('public/icon-192.png');
  await expect(
    settings.getByRole('img', { name: 'Your profile picture', exact: true }),
  ).toBeVisible();
  const prior = await (await page.request.get('/api/account')).json();
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  const stale = await page.request.patch('/api/account', {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      expectedVersion: prior.version,
      firstName: 'Stale',
      lastName: '',
      picture: '',
      requestId: crypto.randomUUID(),
    },
  });
  expect(stale.status()).toBe(409);
  const after = await state(page);
  expect(after.observations).toEqual(before.observations);
  expect(after.staff.name).toBe(before.staff.name);
  expect(after.operations!.v3!.staffProfiles).toBeUndefined();
  await settings.getByRole('button', { name: 'Delete account', exact: true }).click();
  const removal = page.getByRole('dialog', { name: 'Delete account', exact: true });
  await removal.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    removal.getByRole('button', { name: 'Delete my account', exact: true }),
  ).toBeDisabled();
  await removal.getByLabel('Email', { exact: true }).fill('owner@demo.center');
  await removal.getByLabel('Password', { exact: true }).fill('CenterDemo!2026');
  await removal.getByLabel('Type DELETE MY ACCOUNT', { exact: true }).fill('DELETE MY ACCOUNT');
  await removal.getByRole('button', { name: 'Delete my account', exact: true }).click();
  await expect(removal.getByRole('alert')).toContainText('only owner');
  expect((await page.request.get('/api/account')).status()).toBe(200);
});

test('name reception, stable student pouch labels and exact 2-inch printing work without exposing a roster', async ({
  page,
}) => {
  await login(page);
  const student = await learner(page, 'CONNECT'),
    db = await state(page);
  const token = db.students.find((s) => s.id === student.id)!.token;
  await page.goto('/?view=students&student=' + student.id);
  await page.getByRole('button', { name: 'Show pouch identifier', exact: true }).click();
  const pouch = page.getByRole('dialog', { name: 'Pouch identifier', exact: true });
  await expect(pouch).toContainText(student.name);
  await expect(pouch.getByText(token, { exact: true })).toHaveCount(0);
  await expect(pouch.getByText('Reissue QR identifier', { exact: true })).toHaveCount(0);
  const popup = page.waitForEvent('popup');
  await pouch.getByRole('link', { name: 'Print 2 × 2 label', exact: true }).click();
  const print = await popup;
  await print.waitForLoadState();
  await print.emulateMedia({ media: 'print' });
  const box = await print.locator('.pouch-print-label').boundingBox();
  expect(box!.width).toBe(192);
  expect(box!.height).toBe(192);
  await print.screenshot({ path: 'test-results/arithmetica-pouch-print.png' });
  await print.close();
  await page.goto('/reception');
  await page.getByLabel('Full name', { exact: true }).fill(student.name);
  await page.getByRole('button', { name: 'Check in or out by name', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('checked in');
  expect((await state(page)).students.find((s) => s.id === student.id)!.token).toBe(token);
  await page.getByRole('button', { name: 'Lock for shared use' }).click();
  await expect(page).toHaveURL(/\/kiosk$/);
  expect((await page.request.get('/api/state')).status()).toBe(401);
  const config = await (await page.request.get('/api/kiosk')).json();
  expect(Object.keys(config).sort()).toEqual(['confirmationSeconds', 'demo', 'ready']);
  const printResponse = await page.request.get('/students/' + student.id + '/pouch', {
    maxRedirects: 0,
  });
  expect(printResponse.status()).toBe(307);
});

test('reports reveal one metric list on demand and export Excel only monthly', async ({ page }) => {
  await login(page);
  await page.goto('/?view=reports');
  await expect(page.locator('.report-metric-tabs button')).toHaveCount(4);
  await expect(page.locator('.report-drilldown')).toHaveCount(1);
  await expect(page.getByText('Saved snapshots', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Export Excel', exact: true })).toHaveCount(0);
  await page
    .locator('.report-metric-tabs')
    .getByRole('button', { name: /^Visits/ })
    .click();
  await expect(page.getByRole('region', { name: 'Visits', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Summary', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Export Excel', exact: true })).toBeVisible();
  await page.screenshot({
    path: 'test-results/arithmetica-report.png',
    fullPage: true,
    animations: 'disabled',
  });
});
