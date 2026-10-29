import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Snapshot } from '../../src/lib/model';

const origin = 'https://arithmetica-staging.arithmetica.workers.dev';
async function login(page: Page, role = 'owner') {
  const fixtures = JSON.parse(await readFile('data/deployment/staging-test-users.json', 'utf8'));
  const user = fixtures.users.find((entry: { role: string }) => entry.role === role);
  expect(user.email.endsWith('@arithmetica.invalid')).toBe(true);
  const response = await page.request.post(origin + '/api/auth', { headers: { Origin: origin }, data: { email: user.email, password: user.password } });
  expect(response.status(), 'Synthetic sign-in must succeed; credentials are never logged.').toBe(200);
  const state: Snapshot = await (await page.request.get(origin + '/api/state')).json();
  expect(state.runtime?.environment).toBe('staging');
  expect(state.students.length).toBe(71);
  expect(state.students.every((student) => student.name.startsWith('Fictional '))).toBe(true);
  return state;
}

test('anonymous static shell redirects to login without disclosing any roster', async ({ page }) => {
  const shell = await page.goto('/');
  expect(shell?.headers()['content-security-policy']).toContain("object-src 'none'");
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  expect((await page.request.get('/api/state')).status()).toBe(401);
});

test('hosted staff screens, profile readback and existing pouch identity work at tablet and phone widths', async ({ page }) => {
  const state = await login(page);
  const student = state.students[27];
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('71 students');
  await page.getByRole('searchbox', { name: 'Search Student Roster', exact: true }).fill(student.name);
  await page.locator('.roster-v3-person').filter({ hasText: student.name }).click();
  await expect(page.getByRole('heading', { name: student.name, exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Subjects', exact: true })).toContainText('Not set');
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/hosted-pending-profile.png', fullPage: true });
  await page.goto('/students/' + student.id + '/pouch');
  await expect(page.getByRole('heading', { name: 'Pouch label', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Pouch QR for ' + student.name, exact: true })).toBeVisible();
  await expect(page.locator('.pouch-print-label')).toContainText(student.name);
  const label = await page.locator('.pouch-print-label').boundingBox();
  expect(label?.width).toBeCloseTo(192, 0); expect(label?.height).toBeCloseTo(192, 0);
  await page.goto('/?view=reports');
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
});

test('hosted kiosk retains only its scoped session and confirms one named synthetic arrival', async ({ page }) => {
  const state = await login(page, 'assistant');
  const student = state.students[8];
  expect((await page.request.put('/api/kiosk', { headers: { Origin: origin }, data: {} })).status()).toBe(200);
  expect((await page.request.get('/api/state')).status()).toBe(401);
  await page.goto('/kiosk');
  await page.getByRole('textbox', { name: 'Full name', exact: true }).fill(student.name);
  await page.getByRole('button', { name: 'Check in or out by name', exact: true }).click();
  await expect(page.locator('.confirmation-student')).toContainText(student.name);
  expect((await page.request.get('/api/export')).status()).toBe(401);
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === 'cf-cloud' || cookie.name === 'cf-refresh')).toBe(false);
});
