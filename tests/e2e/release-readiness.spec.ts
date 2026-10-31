import { test, expect, type Page } from '@playwright/test';
import { login, settleDialog, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import type { Snapshot } from '../../src/lib/model';

async function fictionalWorkspace(page: Page) {
  await login(page);
  const session = await state(page),
    now = new Date('2026-10-19T23:35:00Z'),
    fixture = quickViewDemo(now);
  await page.clock.install({ time: now });
  const snapshot: Snapshot = {
    ...fixture,
    revision: 10000,
    staff: session.staff,
    timezone: fixture.operations!.center.timezone,
    runtime: { demo: true, adapter: 'local', scheduler: false },
  };
  await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
  return snapshot;
}

test('appearance controls align and their keyboard menu stays inside a resized viewport', async ({
  page,
}) => {
  await fictionalWorkspace(page);
  await page.goto('/?view=settings');
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settleDialog(dialog);
  const theme = dialog.getByRole('button', { name: 'Theme', exact: true }),
    accent = dialog.getByRole('button', { name: 'Accent color', exact: true });
  for (const width of [1024, 390, 320]) {
    await page.setViewportSize({ width, height: 667 });
    const a = (await theme.boundingBox())!,
      b = (await accent.boundingBox())!;
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(await theme.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      await accent.evaluate((el) => getComputedStyle(el).fontSize),
    );
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await accent.click();
  const popover = page.locator('.app-popover:popover-open');
  await expect(popover).toBeVisible();
  await page.setViewportSize({ width: 390, height: 568 });
  await expect
    .poll(async () =>
      popover.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.left >= 11 &&
          rect.top >= 11 &&
          rect.right <= innerWidth - 11 &&
          rect.bottom <= innerHeight - 11
        );
      }),
    )
    .toBe(true);
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitemradio', { name: 'Slate', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('menuitemradio', { name: 'Teal', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(accent).toBeFocused();
  await expect(dialog).toBeVisible();
  await page.screenshot({
    path: 'test-results/release-appearance-390.png',
    animations: 'disabled',
  });
});

test('browser Back restores bare Home and dismisses an open Quick View', async ({ page }) => {
  const snapshot = await fictionalWorkspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const visit = snapshot.visits.find((v) => !v.departedAt && !v.closedAt)!;
  await page.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await page.goBack();
  await page.locator('[data-visit-id="' + visit.id + '"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Student Roster', exact: true })).toBeVisible();
});

for (const surface of ['toolbar', 'settings'])
  test(
    'failed sign-out keeps the session usable with visible feedback in ' + surface,
    async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await fictionalWorkspace(page);
      await page.goto('/');
      await page.route('**/api/auth', (route) =>
        route.fulfill({
          status: 503,
          json: { error: 'Fictional sign-out unavailable. Retry.' },
        }),
      );
      if (surface === 'toolbar') {
        await page.getByRole('button', { name: 'Account', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        const dialog = page.getByRole('dialog', {
          name: 'Settings',
          exact: true,
        });
        await dialog
          .getByRole('navigation', { name: 'Account settings', exact: true })
          .getByRole('button', { name: 'Account', exact: true })
          .click();
        await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
      }
      await expect(
        page.getByRole('alert').filter({ hasText: 'Fictional sign-out unavailable' }),
      ).toBeVisible();
      expect(new URL(page.url()).pathname).toBe('/');
      expect(errors).toEqual([]);
    },
  );

test('older snapshot responses cannot roll back the visible roster', async ({ page }) => {
  const snapshot = await fictionalWorkspace(page);
  await page.goto('/');
  const name = snapshot.students[0].name;
  await page.route('**/api/state', (route) =>
    route.fulfill({
      json: {
        ...snapshot,
        revision: snapshot.revision - 1,
        students: snapshot.students.map((student, index) =>
          index === 0 ? { ...student, name: 'Fictional Stale Snapshot' } : student,
        ),
      },
    }),
  );
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/state');
  const sync = page.getByRole('button', { name: 'Sync students' });
  await sync.click();
  await response;
  await expect(sync).toBeEnabled();
  await page.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await page.getByLabel('Search Student Roster').fill(name);
  await expect(page.locator('.roster-v3-person').filter({ hasText: name })).toBeVisible();
  await expect(page.getByText('Fictional Stale Snapshot')).toHaveCount(0);
});

test('denied browser storage still allows sign-in and session appearance changes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem'])
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value() {
          throw new DOMException('Storage denied', 'SecurityError');
        },
      });
  });
  await login(page);
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Quick View handles a historical visit with no currently enrolled subjects', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const snapshot = await fictionalWorkspace(page);
  const visit = snapshot.visits.find((v) => !v.departedAt && !v.closedAt)!;
  const config = snapshot.operations!.students[visit.studentId];
  config.subjects.Math.enrolled = config.subjects.Reading.enrolled = false;
  await page.goto('/');
  await page.locator('[data-visit-id="' + visit.id + '"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('No enrolled subjects.');
  await dialog.getByRole('button', { name: 'Open student profile' }).click();
  await expect(
    page.getByRole('heading', {
      name: snapshot.students.find((s) => s.id === visit.studentId)!.name,
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('dictation appends to the latest typed draft and releases its callbacks on close', async ({
  page,
}) => {
  const snapshot = await fictionalWorkspace(page);
  const visit = snapshot.visits.find((v) => !v.departedAt && !v.closedAt)!;
  await page.addInitScript(() => {
    class FictionalRecognition {
      onresult: ((event: unknown) => void) | null = null;
      onerror = null;
      onend = null;
      start() {
        Object.assign(window, { fictionalRecognition: this });
      }
      stop() {
        Object.assign(window, { fictionalStopped: true });
      }
    }
    Object.assign(window, { SpeechRecognition: FictionalRecognition });
  });
  await page.goto('/');
  await page.locator('[data-visit-id="' + visit.id + '"]').click();
  const dialog = page.getByRole('dialog');
  const note = dialog.getByLabel('Instructional note');
  await note.fill('Original fictional draft.');
  await dialog.getByRole('button', { name: 'Dictate note', exact: true }).click();
  await note.fill('Edited fictional draft.');
  await page.evaluate(() => {
    const recognition = (
      window as unknown as {
        fictionalRecognition: { onresult: (event: unknown) => void };
      }
    ).fictionalRecognition;
    recognition.onresult({
      results: [{ isFinal: true, 0: { transcript: 'Fictional speech.' } }],
    });
  });
  await expect(note).toHaveValue('Edited fictional draft. Fictional speech.');
  await dialog.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const state = window as unknown as {
        fictionalStopped: boolean;
        fictionalRecognition: { onresult: unknown };
      };
      return state.fictionalStopped && state.fictionalRecognition.onresult === null;
    }),
  ).toBe(true);
});
