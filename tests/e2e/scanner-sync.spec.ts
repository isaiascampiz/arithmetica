import { test, expect, type Page } from '@playwright/test';
import QRCode from 'qrcode';
import { arrive, learner, state } from './helpers';
async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in to your center' }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
}
test('real QR decoder reads a synthetic camera stream and releases it', async ({ page }) => {
  await login(page);
  // Give this decoder test its own identity, independent of retained visit history.
  const student = await learner(page, 'CONNECT');
  const token = (await state(page)).students.find((s) => s.id === student.id)!.token;
  await page.getByRole('button', { name: 'Open kiosk', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Scan your pouch.' })).toBeVisible();
  await page.getByRole('button', { name: 'Lock for shared use' }).click();
  await expect(page).toHaveURL(/\/kiosk$/);
  await expect(page.getByRole('heading', { name: 'Scan your pouch.' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Use camera' }).click();
  try {
    await expect(page.getByRole('status')).toContainText(/checked (in|out)/);
  } catch (error) {
    console.log(
      'Synthetic camera diagnostic',
      await page.evaluate(() => {
        const video = document.querySelector('video');
        const stream = (window as unknown as { testStream?: MediaStream }).testStream;
        return {
          video: video
            ? {
                width: video.videoWidth,
                height: video.videoHeight,
                readyState: video.readyState,
                paused: video.paused,
                currentTime: video.currentTime,
              }
            : null,
          tracks: stream?.getTracks().map((track) => ({
            state: track.readyState,
            settings: track.getSettings(),
          })),
        };
      }),
    );
    await page
      .locator('video')
      .screenshot({ path: 'test-results/synthetic-camera-diagnostic.png' });
    throw error;
  }
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
  const student = await learner(page, 'CONNECT');
  const visit = await arrive(page, student.id);
  const note = `Shared fictional note ${Date.now()}`;
  const response = await page.request.post('/api/commands', {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      kind: 'observation',
      studentId: student.id,
      choices: ['Strong focus'],
      text: note,
      followUp: true,
    },
  });
  expect(response.ok()).toBe(true);
  await otherPage.reload();
  await otherPage.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await otherPage.getByLabel('Search Student Roster').fill(student.name);
  await otherPage.locator('.roster-v3-person').filter({ hasText: student.name }).click();
  await otherPage.getByRole('button', { name: 'Visit History', exact: true }).click();
  await otherPage
    .locator('[data-history-visit="' + visit.id + '"]')
    .getByRole('button', { name: 'View session' })
    .click();
  await expect(
    otherPage.getByRole('dialog').locator('.history-note').filter({ hasText: note }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'test-results/v3-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/v3-dark.png', fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'test-results/v3-portrait.png',
    fullPage: true,
  });
  await other.close();
});
