import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import type { Snapshot } from '../../src/lib/model';

test('center midnight, live elapsed time and activity counts keep ticking after clock isolation', async ({
  page,
}) => {
  await login(page);
  const session = await state(page);
  const now = new Date('2026-10-13T06:59:58Z'); // Monday 23:59:58 in Los Angeles.
  const fixture = quickViewDemo(now);
  const student = fixture.students[0];
  fixture.visits = [];
  for (const s of fixture.students) fixture.operations!.students[s.id].active = s.id === student.id;
  fixture.operations!.students[student.id].visitDays = [1];
  const snapshot: Snapshot = {
    ...fixture,
    staff: session.staff,
    timezone: 'America/Los_Angeles',
  };
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1000));
  await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/commands')) writes++;
  });
  await page.goto('/');
  const expected = page
    .locator('.home-v3-metrics>button')
    .filter({ hasText: 'Still expected' })
    .locator('b');
  await expect(expected).toHaveText('1');
  await page.clock.runFor(3000);
  await expect(expected).toHaveText('0');
  await expect(page.locator('.header-location > span:not(.workspace-center-name)')).toContainText(
    'Tuesday 12:00 AM',
  );

  snapshot.visits.push({
    id: 'clock-visit',
    studentId: student.id,
    arrivedAt: '2026-10-13T06:59:04Z',
    departedAt: null,
  });
  await page.reload();
  const elapsed = page.locator('[data-visit-id="clock-visit"] .live-v3-time > b');
  await expect(elapsed).toHaveText('0 min');
  await page.clock.runFor(3000);
  await expect(elapsed).toHaveText('1 min');

  await page.goto('/?view=activity');
  const total = page.locator('.traffic-summary .recorded-stat dd').first();
  await expect(total).toHaveText('0');
  snapshot.visits[0].arrivedAt = new Date(
    (await page.evaluate(() => Date.now())) - 1000,
  ).toISOString();
  await page.reload();
  await expect(total).toHaveText('1');
  await page.clock.runFor(3000);
  await expect(total).toHaveText('1');
  expect(writes).toBe(0);
});
