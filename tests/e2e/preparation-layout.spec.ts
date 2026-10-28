import { packetLabel } from '../../src/lib/v3-planning';
import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import type { Snapshot } from '../../src/lib/model';

for (const width of [1440, 1366, 1024, 768, 390, 320])
  test('preparation layout keeps all packets and clear readiness at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    const session = await state(page),
      now = new Date('2026-10-12T21:00:00Z'),
      fixture = quickViewDemo(now);
    const [dual, mixed, single] = fixture.students;
    const sets = fixture.operations!.assignments.filter((a) => a.v3 && !a.v3.issuedAt);
    for (const a of sets) {
      if (a.studentId === dual.id && a.subject === 'Reading') {
        a.v3!.preparedAt = null;
        if (a.v3!.inCenter) a.v3!.inCenter.prepared = false;
        a.v3!.planned.forEach((p) => {
          p.prepared = false;
        });
      }
      if (a.studentId === mixed.id) a.v3!.review = ['Fictional catalog review needed.'];
      if (a.studentId === single.id) {
        a.v3!.preparedAt = now.toISOString();
        if (a.v3!.inCenter) a.v3!.inCenter.prepared = true;
        a.v3!.planned.forEach((p) => {
          p.prepared = true;
        });
      }
    }
    const snapshot: Snapshot = {
      ...fixture,
      staff: session.staff,
      timezone: fixture.operations!.center.timezone,
      runtime: { demo: true, adapter: 'local', scheduler: false },
    };
    await page.clock.install({ time: now });
    await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
    let writes = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/commands')) writes++;
    });
    const before = JSON.stringify(snapshot);
    await page.goto('/?view=homework');
    const card = page.locator('[data-preparation-student="' + dual.id + '"]');
    await expect(card).toContainText('Expected');
    await expect(card.locator('.prep-actions')).toHaveCount(0);
    const math = card.getByRole('region', { name: 'Math preparation' });
    const reading = card.getByRole('region', { name: 'Reading preparation' });
    await expect(math.locator('.prep-status')).toHaveText('Prepared');
    await expect(reading.getByRole('button', { name: 'Mark Reading prepared' })).toBeEnabled();
    await expect(reading).toContainText('Start at 4A26');
    await expect(reading).toContainText('5 worksheets in each range');
    const planned = sets.filter((a) => a.studentId === dual.id);
    await expect(card.locator('.packet-chip')).toHaveCount(
      planned.reduce((n, a) => n + (a.v3!.inCenter ? 1 : 0) + a.v3!.planned.length, 0),
    );
    const m = (await math.boundingBox())!,
      r = (await reading.boundingBox())!;
    expect(m.x).toBe(r.x);
    expect(r.y).toBeGreaterThan(m.y);
    expect(m.width).toBeCloseTo(r.width, 1);
    await expect(card.locator('.packet-chip')).toHaveText(
      planned.flatMap((a) =>
        [...(a.v3!.inCenter ? [a.v3!.inCenter] : []), ...a.v3!.planned].map(packetLabel),
      ),
    );
    for (const button of await card.getByRole('button').all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const connectCard = page.locator('[data-preparation-student="' + mixed.id + '"]');
    await expect(connectCard.getByRole('region', { name: 'Reading preparation' })).toHaveCount(0);
    await expect(connectCard).toContainText('Plan needs review');
    await expect(connectCard).not.toContainText('Fictional catalog review needed.');
    await expect(connectCard.locator('.warning-line')).toHaveCount(0);
    await expect(
      connectCard.getByRole('button', { name: 'Mark Math prepared', exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: 'test-results/preparation-layout-' + width + '.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: /^Prepared/ }).click();
    const ready = page.locator('[data-preparation-student="' + single.id + '"]');
    await expect(ready.getByRole('region', { name: 'Reading preparation' })).not.toBeVisible();
    await ready.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(ready.getByRole('region', { name: 'Reading preparation' })).toBeVisible();
    expect(
      await ready.locator('.prep-subjects').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.getByLabel('Search preparation').fill('no fictional student matches');
    await expect(
      page.getByRole('heading', { name: 'No students match your search' }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(writes).toBe(0);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

test('preparation queues unfinished today, tomorrow and later returns in order', async ({
  page,
}) => {
  await login(page);
  const session = await state(page),
    now = new Date('2026-10-12T21:00:00Z'),
    fixture = quickViewDemo(now);
  for (const a of fixture.operations!.assignments.filter((a) => a.v3 && !a.v3.issuedAt)) {
    const index = fixture.students.findIndex((s) => s.id === a.studentId);
    a.v3!.visitDate = ['2026-10-14', '2026-10-13', '2026-10-12'][index];
    a.v3!.preparedAt = null;
  }
  await page.clock.install({ time: now });
  await page.route('**/api/state', (route) =>
    route.fulfill({
      json: { ...fixture, staff: session.staff, timezone: fixture.operations!.center.timezone },
    }),
  );
  await page.goto('/?view=homework');
  await expect(page.locator('.prep-entry')).toHaveCount(3);
  await expect(page.locator('.prep-entry').nth(0)).toContainText('Expected Today');
  await expect(page.locator('.prep-entry').nth(1)).toContainText('Expected Tue');
  await expect(page.locator('.prep-entry').nth(2)).toContainText('Expected Wed');
});
