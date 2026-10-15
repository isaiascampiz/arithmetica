import { test, expect, type Page } from '@playwright/test';
import QRCode from 'qrcode';
import { learner, state } from './helpers';
async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in to your center' }).click();
  await expect(page.getByRole('heading', { name: 'Your center, right now.' })).toBeVisible();
}
test('real QR decoder reads a synthetic camera stream and releases it', async ({ page }) => {
  await login(page);
  // Give this decoder test its own identity, independent of retained visit history.
  const student = await learner(page, 'CONNECT');
  const token = (await state(page)).students.find((s) => s.id === student.id)!.token;
  await page.getByRole('button', { name: 'Open kiosk', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'SCAN YOUR POUCH' })).toBeVisible();
  const image = await QRCode.toDataURL(token, { width: 400, margin: 4 });
  await page.evaluate((src) => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;
        const image = new Image();
        image.src = src;
        await new Promise((resolve) => {
          image.onload = resolve;
        });
        const draw = () => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 640, 480);
          ctx.drawImage(image, 120, 40, 400, 400);
        };
        draw();
        const stream = canvas.captureStream(10);
        const interval = setInterval(draw, 100);
        (window as unknown as { testStream: MediaStream }).testStream = stream;
        stream.getTracks()[0].addEventListener('ended', () => clearInterval(interval));
        return stream;
      },
    });
  }, image);
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByRole('status')).toContainText(/checked (in|out)/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { testStream: MediaStream }).testStream
          .getTracks()
          .every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
  expect((await page.request.get('/api/state')).status()).toBe(401);
});
test('separate staff devices see shared persistent notes; themes and larger layouts work', async ({
  page,
  browser,
}) => {
  await login(page);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage);
  const state = await (await page.request.get('/api/state')).json();
  const note = `Shared fictional note ${Date.now()}`;
  const response = await page.request.post('/api/commands', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      kind: 'observation',
      studentId: state.students[2].id,
      choices: ['Strong focus'],
      text: note,
      followUp: true,
    },
  });
  expect(response.ok()).toBe(true);
  await otherPage.reload();
  await otherPage.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await otherPage.getByLabel('Search Student Roster').fill(state.students[2].name);
  await otherPage.locator('.roster-v3-person').filter({ hasText: state.students[2].name }).click();
  await otherPage.getByRole('button', { name: 'Visit History', exact: true }).click();
  await expect(otherPage.locator('.history-note').filter({ hasText: note })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/v3-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/v3-dark.png', fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/v3-portrait.png', fullPage: true });
  await other.close();
});
