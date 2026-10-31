import { test, expect, type BrowserContext } from '@playwright/test';
import ExcelJS from 'exceljs';
import {
  login,
  state,
  learner,
  arrive,
  prepare,
  handoff,
  physical,
  openProfile,
  command,
} from './helpers';
import { verificationPackets } from '../../src/lib/completion-evidence';
import { dayKey } from '../../src/lib/model';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import { addFictionalCenterActivity } from '../fixtures/center-activity-demo';
import { buildReport } from '../../src/lib/reports';

test('verification, immutable monthly reports, retry-safe revisions and real Excel downloads reconcile', async ({
  page,
}) => {
  await login(page);
  const student = await learner(page),
    visit = await arrive(page, student.id);
  await prepare(page, student.id);
  await handoff(page, visit);
  await physical(page, student.id, 'out');
  const before = await state(page),
    evidence = verificationPackets(before, visit.id, 'Math')[0];
  expect(evidence).toBeTruthy();
  await openProfile(page, student.name);
  await page.getByRole('button', { name: 'Visit History', exact: true }).click();
  await page.getByRole('button', { name: 'View session', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Verify completed sheets', { exact: true }).click();
  await dialog.getByLabel('Recorded paper packet').selectOption(evidence.packet.id);
  await dialog
    .getByLabel('Verified worksheet numbers (comma-separated)')
    .fill(String(evidence.packet.range.start));
  await dialog
    .getByLabel('Verification note', { exact: true })
    .fill('Fictional instructor checked this physical sheet');
  await dialog.getByRole('button', { name: 'Save verified completion', exact: true }).click();
  await expect(dialog.getByText('Verified completion saved.', { exact: true })).toBeVisible();
  let db = await state(page);
  expect(
    db.operations!.completions.find((c) => c.packetId === evidence.packet.id)!.physicalSheets,
  ).toBe(1);
  await command(page, 'v3', {
    action: 'observation',
    visitId: visit.id,
    choices: [],
    text: 'Fictional report session observation',
    followUp: false,
  });
  await page.goto('/?view=reports');
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  await expect(page.locator('.report-metric-tabs button')).toHaveCount(4);
  await page
    .locator('.report-metric-tabs')
    .getByRole('button', { name: /^Observations recorded/ })
    .click();
  await page.getByLabel('Search report students').fill(student.name);
  await expect(page.getByLabel('Search report students')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.report-visit-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'View session', exact: true }).click();
  const reportSession = page.getByRole('dialog');
  await expect(reportSession).toContainText('Fictional report session observation');
  await expect(
    reportSession.getByRole('button', {
      name: 'Edit observation',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(reportSession.getByText('Verify completed sheets', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page
    .locator('.report-metric-tabs')
    .getByRole('button', { name: /^Observations not recorded/ })
    .click();
  await page.getByLabel('Search report students').fill(student.name);
  await expect(page.locator('.report-visit-row')).toHaveCount(0);
  await page
    .locator('.report-metric-tabs')
    .getByRole('button', { name: /^Verified completed worksheets/ })
    .click();
  await page.getByLabel('Search report students').fill(student.name);
  await page.getByRole('button', { name: 'View worksheets', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 verified worksheets');
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await page
    .locator('.report-metric-tabs')
    .getByRole('button', { name: /^Observations recorded/ })
    .click();
  await page.screenshot({
    path: 'test-results/arithmetica-report-sessions.png',
    fullPage: true,
    animations: 'disabled',
  });
  const date = dayKey(new Date(), db.timezone);
  const body = {
    kind: 'monthly',
    period: date,
    reason: 'Fictional retry-safe monthly archive',
    newVersion: true,
    requestId: crypto.randomUUID(),
  };
  const post = () =>
    page.request.post('/api/reports', {
      headers: { Origin: new URL(page.url()).origin },
      data: body,
    });
  const first = await post();
  expect(first.ok()).toBe(true);
  const { id } = await first.json();
  expect((await (await post()).json()).id).toBe(id);
  db = await state(page);
  expect(db.operations!.reports.filter((r) => r.requestId === body.requestId)).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: 'Monthly', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export Excel', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await download.path())!);
  const archived = db.operations!.reports.find((r) => r.id === id)!;
  const rows = workbook.getWorksheet('Monthly worksheets')!;
  let count = 0;
  rows.eachRow((row, index) => {
    if (index > 1 && typeof row.getCell(6).value === 'number')
      count += Number(row.getCell(6).value);
  });
  expect(count).toBe(archived.payload.physicalSheets);
  expect(archived.payload.detail!.completions.some((c) => c.packetId === evidence.packet.id)).toBe(
    true,
  );
  const snapshot = JSON.stringify(archived.payload);
  await page.request.post('/api/commands', {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      kind: 'v3',
      requestId: crypto.randomUUID(),
      command: {
        action: 'observation',
        visitId: visit.id,
        choices: [],
        text: 'Fictional note added after the archive',
        followUp: false,
      },
    },
  });
  expect(
    JSON.stringify((await state(page)).operations!.reports.find((r) => r.id === id)!.payload),
  ).toBe(snapshot);
});

test('settings expose only useful categories and locked reception never exposes staff data', async ({
  page,
}) => {
  await login(page);
  await page.goto('/?view=settings');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
  await expect(settings.getByRole('switch', { name: 'Homework', exact: true })).toBeVisible();
  for (const text of [
    'Staff coverage & additional graders',
    'Attendance & kiosk',
    'Achievement medals',
    'Report automation',
  ])
    await expect(settings.getByText(text, { exact: true })).toHaveCount(0);
  await settings.getByRole('button', { name: 'Change', exact: true }).click();
  const editor = page.getByRole('dialog', {
    name: 'Observation shortcuts',
    exact: true,
  });
  await editor.getByRole('textbox').first().fill('Fictional focused work');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  await expect(settings).toContainText('Fictional focused work');
  await page.goto('/reception');
  await expect(page.getByRole('heading', { name: 'Scan your pouch.' })).toBeVisible();
  expect((await page.request.get('/api/state')).status()).toBe(200);
  await page.getByRole('link', { name: 'Arithmetica home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.goto('/reception');
  await page.getByRole('button', { name: 'Lock for shared use' }).click();
  await expect(page).toHaveURL(/\/kiosk$/);
  const config = await (await page.request.get('/api/kiosk')).json();
  expect(Object.keys(config).sort()).toEqual(['confirmationSeconds', 'demo', 'ready']);
  expect(config.confirmationSeconds).toBe(4);
  expect((await page.request.get('/api/state')).status()).toBe(401);
  expect((await page.request.get('/api/account')).status()).toBe(401);
  expect(
    (await page.request.get('/api/reports?preview=true&kind=daily&period=2026-10-19')).status(),
  ).toBe(401);
});

let visualCookies: Awaited<ReturnType<BrowserContext['cookies']>> | undefined;
for (const width of [390, 768, 1024, 1440])
  for (const theme of ['light', 'dark']) {
    test(`final screens are usable at ${width}px in ${theme}`, async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 1000 });
      if (visualCookies) {
        await page.context().addCookies(visualCookies);
        await page.goto('/');
      } else {
        await login(page);
        visualCookies = await page.context().cookies();
      }
      const session = await state(page),
        now = new Date('2026-10-19T23:35:00Z');
      const db = quickViewDemo(now);
      addFictionalCenterActivity(db, now);
      const snapshot = {
        ...db,
        staff: session.staff,
        timezone: db.operations!.center.timezone,
      };
      await page.clock.install({ time: now });
      await page.route('**/api/state', (r) => r.fulfill({ json: snapshot }));
      await page.route('**/api/reports?*', (r) =>
        r.fulfill({
          json: {
            id: 'preview',
            kind: 'daily',
            period: '2026-10-19',
            version: 0,
            sourceRevision: db.revision,
            generatedAt: now.toISOString(),
            reason: 'Fictional visual preview',
            payload: buildReport(db, 'daily', '2026-10-19', now),
          },
        }),
      );
      await page.evaluate((value) => localStorage.setItem('cf-theme', value), theme);
      for (const view of ['settings', 'activity', 'reports']) {
        await page.goto('/?view=' + view);
        if (view === 'settings') {
          const nav = page.getByRole('navigation', {
            name: 'Settings sections',
          });
          await expect(nav.getByRole('button', { name: 'General', exact: true })).toHaveAttribute(
            'aria-current',
            'page',
          );
          await expect(page.getByRole('switch', { name: 'Homework', exact: true })).toBeVisible();
        }
        if (view === 'activity') {
          await expect(page.locator('.activity-comparison .attendance-chart-frame')).toHaveCount(1);
          const bars = page
            .locator('.activity-comparison .attendance-column')
            .filter({ has: page.locator('.activity-actual-bar') })
            .first();
          const actual = await bars.locator('.activity-actual-bar').boundingBox(),
            average = await bars.locator('.activity-expected-bar').boundingBox();
          if (actual && average) expect(actual.width).toBe(average.width);
        }
        if (view === 'reports') {
          await expect(page.locator('.report-metric-tabs button')).toHaveCount(4);
          const previous = (await page
            .getByRole('button', {
              name: 'Previous report period',
              exact: true,
            })
            .boundingBox())!;
          const next = (await page
            .getByRole('button', { name: 'Next report period', exact: true })
            .boundingBox())!;
          expect(previous.y).toBe(next.y);
          const values = await page.locator('.report-metric-tabs button b').evaluateAll((els) =>
            els.map((el) => ({
              y: el.getBoundingClientRect().y,
              cardY: el.parentElement!.getBoundingClientRect().y,
            })),
          );
          for (const value of values) {
            const peer = values.find((v) => v.cardY === value.cardY)!;
            expect(Math.abs(peer.y - value.y)).toBeLessThan(1);
          }
        }
        await page.screenshot({
          path: `test-results/final-${view}-${width}-${theme}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.unroute('**/api/state');
      await page.goto('/reception');
      await expect(page.getByRole('heading', { name: 'Scan your pouch.' })).toBeVisible();
      await page.screenshot({
        path: `test-results/final-kiosk-${width}-${theme}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
