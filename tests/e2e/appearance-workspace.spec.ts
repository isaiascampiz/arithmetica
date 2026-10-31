import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import {
  addInteractiveProgressStudent,
  progressStudentId,
} from '../fixtures/interactive-progress-student';
import { buildReport } from '../../src/lib/reports';
for (const width of [1024, 768, 390])
  test('shared search, dates and period rails align at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    const session = await state(page),
      now = new Date('2026-10-19T23:35:00Z'),
      db = quickViewDemo(now);
    await page.clock.install({ time: now });
    await page.route('**/api/state', (route) =>
      route.fulfill({
        json: {
          ...db,
          staff: session.staff,
          timezone: db.operations!.center.timezone,
        },
      }),
    );
    const positions = [];
    let calendar;
    for (const [view, label] of [
      ['students', 'Search Student Roster'],
      ['homework', 'Search preparation'],
      ['activity', 'Search check-ins'],
      ['reports', 'Search report students'],
    ] as const) {
      await page.goto('/?view=' + view);
      const search = page.getByLabel(label),
        box = (await search.locator('..').boundingBox())!;
      positions.push({
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      });
      if (view === 'activity' || view === 'reports') {
        const controls = page.locator('.workspace-date-controls');
        await expect(controls.getByText('Today', { exact: true })).toBeVisible();
        await expect(controls.getByRole('button', { name: 'Today', exact: true })).toHaveCount(0);
        expect(
          await page.locator('.workspace-period-rail').evaluate((el) => !!el.closest('.panel')),
        ).toBe(false);
        const dateBox = (await controls.boundingBox())!;
        if (calendar)
          expect({
            x: dateBox.x,
            width: dateBox.width,
            height: dateBox.height,
          }).toEqual(calendar);
        else
          calendar = {
            x: dateBox.x,
            width: dateBox.width,
            height: dateBox.height,
          };
        await page
          .getByLabel(view === 'activity' ? 'Activity date' : 'Period date', {
            exact: true,
          })
          .fill('2026-10-18');
        await expect(controls).not.toContainText('Today');
        await expect(controls).toContainText('Oct 18, 2026');
        await page.getByRole('button', { name: 'Yearly', exact: true }).click();
        await expect(
          page.getByLabel(view === 'activity' ? 'Activity year' : 'Report year'),
        ).toBeVisible();
        if (view === 'reports') {
          await expect(
            page.getByRole('heading', { name: 'Yearly report', exact: true }),
          ).toBeVisible();
          await expect(page.getByRole('button', { name: 'Export Excel', exact: true })).toHaveCount(
            0,
          );
        }
        await page.screenshot({
          path: 'test-results/shared-' + view + '-' + width + '.png',
          fullPage: true,
          animations: 'disabled',
        });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect(positions).toEqual(Array(4).fill(positions[0]));
    if (width === 1024) {
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await expect(page.locator('.sidebar')).toHaveCSS('width', '72px');
      const centers = await page
        .locator(
          '.desktop-sidebar-control > svg,.sidebar-brand .brand-icon > svg,.sidebar .nav-item > svg',
        )
        .evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return r.x + r.width / 2;
          }),
        );
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);
      await page.screenshot({
        path: 'test-results/sidebar-alignment.png',
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      const home = page.locator('.sidebar nav .nav-item').first();
      await expect(home.getByText('Home', { exact: true })).toBeVisible();
      expect((await home.boundingBox())!.width).toBeGreaterThan(150);
    }
  });
test('accent setting survives reload and leaves distinct skill identities unchanged', async ({
  page,
}) => {
  await login(page);
  const session = await state(page),
    now = new Date('2026-10-19T23:35:00Z'),
    fixture = quickViewDemo(now);
  addInteractiveProgressStudent(fixture, now);
  await page.clock.install({ time: now });
  await page.route('**/api/state', (route) =>
    route.fulfill({
      json: {
        ...fixture,
        staff: session.staff,
        timezone: fixture.operations!.center.timezone,
      },
    }),
  );
  await page.goto('/?view=students&student=' + progressStudentId);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  const skill = page.getByRole('article', {
    name: 'Skill ratings',
    exact: true,
  });
  const colors = await skill
    .locator('.skill-scatter-average')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).getPropertyValue('--skill-color')));
  expect(new Set(colors).size).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('button', { name: 'Accent color', exact: true }).click();
  await expect(
    page.getByRole('menu', { name: 'Accent color', exact: true }).getByRole('menuitemradio'),
  ).toHaveCount(12);
  await page.getByRole('menuitemradio', { name: 'Violet', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
  await page.screenshot({
    path: 'test-results/accent-settings.png',
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  expect(
    await skill
      .locator('.skill-scatter-average')
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).getPropertyValue('--skill-color')),
      ),
  ).toEqual(colors);
  expect(
    await page
      .locator('.academic-progress,.homework-consistency,.center-duration')
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).getPropertyValue('--brand').trim()),
      ),
  ).toEqual(Array(3).fill('#c8acf0'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
  await page.goto('/?view=activity');
  expect(
    await page
      .locator('.activity-actual-bar')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(200, 172, 240)');
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click();
  expect(
    await page
      .locator('.activity-actual-bar')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(113, 80, 160)');
});
test('yearly report is authorized and read-only, and Excel remains monthly', async ({ page }) => {
  await login(page);
  const before = await state(page),
    r = await page.request.get('/api/reports?preview=true&kind=yearly&period=2026-10-19');
  expect(r.ok()).toBe(true);
  const report = await r.json();
  expect(report.kind).toBe('yearly');
  expect(report.payload.detail.start).toBe('2026-01-01');
  expect(report.payload.detail.end).toBe('2026-12-31');
  expect(report.payload.visits).toBe(
    buildReport(before, 'yearly', '2026', new Date(report.generatedAt)).visits,
  );
  expect((await state(page)).operations!.reports).toEqual(before.operations!.reports);
  expect(
    (
      await page.request.get('/api/reports?preview=true&kind=yearly&period=2026-10-19&format=xlsx')
    ).status(),
  ).toBe(400);
});
for (const reduced of [false, true])
  test(
    'kiosk background makes arrival and departure clear' + (reduced ? ' with reduced motion' : ''),
    async ({ page }) => {
      await page.emulateMedia({
        reducedMotion: reduced ? 'reduce' : 'no-preference',
      });
      await login(page);
      let direction = 'in';
      await page.route('**/api/reception', (route) =>
        route.fulfill({
          json:
            route.request().method() === 'GET'
              ? { ready: true, demo: true, confirmationSeconds: 4 }
              : {
                  message: 'Recorded',
                  changed: true,
                  direction,
                  studentName: 'Fictional Jamie Demo',
                },
        }),
      );
      await page.route('**/api/reception/name', (route) =>
        route.fulfill({ json: { completion: null } }),
      );
      await page.goto('/reception');
      await expect(page.locator('.reception-backdrop')).toHaveAttribute('data-state', 'idle');
      await expect(page.locator('.reception-signal')).toHaveCount(0);
      for (const d of ['in', 'out']) {
        direction = d;
        await page.getByLabel('Full name', { exact: true }).fill('Fictional Jamie Demo');
        await page.getByRole('button', { name: 'Check in or out by name' }).click();
        await expect(page.getByRole('status')).toContainText(
          d === 'in' ? "You're checked in." : "You're checked out.",
        );
        await expect(page.locator('.reception-backdrop')).toHaveAttribute('data-state', d);
        expect(
          await page.locator('.receipt-mark').evaluate((el) => getComputedStyle(el).color),
        ).toBe(d === 'in' ? 'rgb(128, 223, 172)' : 'rgb(243, 160, 164)');
        if (!reduced) {
          await page.locator('.reception-confirmation-wave').evaluate((el) =>
            el.getAnimations().forEach((a) => {
              a.pause();
              a.currentTime = 280;
            }),
          );
          await page.screenshot({
            path: 'test-results/kiosk-wave-' + d + '.png',
            animations: 'allow',
          });
          await page
            .locator('.reception-confirmation-wave')
            .evaluate((el) => el.getAnimations().forEach((a) => a.finish()));
        } else await expect(page.locator('.reception-confirmation-wave')).not.toBeVisible();
        await expect(page.getByRole('status')).toContainText(
          d === 'in' ? 'Arrival recorded' : 'Departure recorded',
        );
        if (reduced)
          expect(
            await page
              .locator('.reception-contours')
              .evaluate((el) => getComputedStyle(el).transform),
          ).toBe('none');
        await page.screenshot({
          path: 'test-results/kiosk-background-' + d + '-' + reduced + '.png',
          fullPage: true,
          animations: 'disabled',
        });
        await page.getByRole('button', { name: 'Ready for the next student' }).click();
      }
    },
  );
