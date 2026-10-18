import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { academicProgressDemo } from '../fixtures/academic-progress-demo';
import {
  addInteractiveProgressStudent,
  progressStudentId,
} from '../fixtures/interactive-progress-student';
import { skillSeries, skillAverage } from '../../src/lib/skill-progress';
import { academicHistory } from '../../src/lib/academic-progress';
import type { Snapshot } from '../../src/lib/model';

for (const width of [1440, 1024, 390, 320])
  test(
    'Progress previews and expansions are read-only and responsive at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await login(page);
      const now = new Date('2026-10-12T21:00:00Z'),
        session = await state(page),
        fixture = academicProgressDemo(now);
      const student = fixture.students[0];
      fixture.observations.push({
        id: 'fictional-progress-observation',
        studentId: student.id,
        visitId: fixture.visits.find((v) => v.studentId === student.id)!.id,
        subject: null,
        createdAt: '2026-10-05T21:00:00Z',
        author: 'Fictional Demo Instructor',
        text: '',
        choices: [],
        followUp: false,
        reviewedAt: null,
        reviewedBy: null,
        skillRatings: [{ id: 'focus', label: 'Focus', score: 2 }],
        revisions: [
          {
            at: '2026-10-06T21:00:00Z',
            actor: 'Fictional Demo Instructor',
            text: '',
            skillRatings: [
              { id: 'focus', label: 'Focus', score: 4 },
              { id: 'handwriting', label: 'Handwriting', score: 3 },
              { id: 'independence', label: 'Independence', score: 5 },
            ],
          },
        ],
      });
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
      await page.goto('/?view=students&student=' + student.id);
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      const cards = page.locator('.progress-grid > article');
      await expect(cards).toHaveCount(4);
      await expect(page.getByRole('tab', { name: 'Math', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.getByRole('list', { name: 'Recorded academic history' })).toHaveCount(0);
      const boxes = await cards.evaluateAll((els) =>
        els.map((el) => ({
          x: el.getBoundingClientRect().x,
          y: el.getBoundingClientRect().y,
          height: el.getBoundingClientRect().height,
        })),
      );
      if (width > 760) {
        expect(boxes[0].y).toBe(boxes[1].y);
        expect(boxes[0].height).toBeCloseTo(boxes[1].height, 0);
        expect(boxes[0].x).toBe(boxes[2].x);
        expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
      } else expect(boxes.every((box) => box.x === boxes[0].x)).toBe(true);
      const duration = page.getByRole('article', { name: 'Time spent at center', exact: true });
      const skills = page.getByRole('article', { name: 'Skill ratings', exact: true });
      await expect(
        skills.getByRole('meter', { name: 'Focus average', exact: true }),
      ).toHaveAttribute(
        'aria-valuenow',
        String(
          skillAverage(
            skillSeries(fixture, student.id)
              .find((s) => s.id === 'focus')!
              .records.filter((r) => r.day >= '2026-08-01' && r.day <= '2026-10-12'),
          ),
        ),
      );
      await expect(skills).toContainText('Visit-wide');
      expect(
        await page.locator('.progress-card-preview .academic-grid-vertical').count(),
      ).toBeLessThanOrEqual(13);
      const previewGrid = page.locator('.progress-card-preview .academic-grid-horizontal');
      expect(await previewGrid.count()).toBeGreaterThan(3);
      expect(await previewGrid.first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        'rgb(194, 205, 217)',
      );
      await expect(page.locator('.progress-card-preview .academic-level-labels')).toContainText(
        /\d+/,
      );
      expect(
        (await page.locator('.progress-card-preview .academic-chart').boundingBox())!.height,
      ).toBeGreaterThanOrEqual(200);
      expect(
        (await page.locator('.progress-card-preview .academic-axis-title').boundingBox())!.height,
      ).toBeLessThanOrEqual(16);
      const previewHeight = (await page
        .locator('.progress-card-preview .academic-chart')
        .boundingBox())!.height;
      expect(previewHeight).toBeLessThan(330);
      const plotWidth = await page
        .locator('.progress-card-preview .academic-plot')
        .evaluate((el) => el.clientWidth);
      expect(previewHeight).toBe(Math.min(300, Math.max(220, Math.round(plotWidth / 2) + 80)));
      const durationText = await duration.innerText(),
        skillsText = await skills.innerText();
      await page.getByRole('tab', { name: 'Reading', exact: true }).click();
      expect(await duration.innerText()).toBe(durationText);
      expect(await skills.innerText()).toBe(skillsText);
      await page.getByRole('tab', { name: 'Math', exact: true }).click();
      await page.screenshot({
        path: 'test-results/progress-grid-' + width + '.png',
        fullPage: true,
      });
      for (const title of [
        'Academic progress',
        'Homework consistency',
        'Time spent at center',
        'Skill ratings',
      ]) {
        const expand = page.getByRole('button', { name: 'Open ' + title, exact: true });
        await page.getByRole('article', { name: title, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: title, exact: true });
        await expect(dialog).toBeVisible();
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        if (title === 'Academic progress') {
          await expect(dialog.getByRole('combobox', { name: 'Academic period' })).toHaveValue(
            'All time',
          );
          await expect(dialog.getByRole('checkbox')).toHaveCount(0);
          expect(
            (await dialog.locator('.academic-chart, .academic-empty-chart').boundingBox())!.height,
          ).toBe(440);
          await expect(dialog.locator('.academic-level-labels')).toContainText(/\d+/);
          await expect(dialog.locator('.academic-connection path')).toHaveAttribute('d', /L /);
          await expect(
            dialog.getByRole('list', { name: 'Recorded academic history' }),
          ).not.toBeVisible();
          const point = dialog.getByRole('button', { name: /^View .* snapshot$/ }).first();
          await point.focus();
          await page.keyboard.press('Enter');
          const popup = dialog.getByRole('tooltip', { name: 'Academic snapshot' });
          await expect(popup).toBeVisible();
          await expect(popup).toContainText('Homework completion recorded');
          await expect(popup.locator('.academic-completed-packet')).toHaveCount(1);
          await expect(popup).not.toContainText('Issued packet');
          await expect(dialog.locator('.academic-grid-vertical')).toHaveCount(13);
          await expect(dialog).not.toContainText('Highest recorded level');
          const popupBox = (await popup.boundingBox())!,
            frame = (await dialog.boundingBox())!;
          expect(popupBox.y).toBeGreaterThanOrEqual(frame.y);
          expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(frame.y + frame.height);
          await page.screenshot({ path: 'test-results/progress-popup-' + width + '.png' });
          expect(await popup.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(
            true,
          );
          await page.keyboard.press('Escape');
          await expect(popup).toHaveCount(0);
          await expect(dialog).toBeVisible();
          const pointButtons = dialog.getByRole('button', { name: /^View .* snapshot$/ });
          const nearbyButton = pointButtons.nth((await pointButtons.count()) - 2);
          const expectedDate = (await nearbyButton.getAttribute('aria-label'))!
            .slice(5)
            .replace(/ \S+ snapshot$/, '');
          const nearby = (await nearbyButton.boundingBox())!;
          await page.mouse.click(nearby.x + nearby.width / 2, nearby.y + nearby.height / 2);
          await expect(popup).toContainText(expectedDate);
          await page.keyboard.press('Escape');
          await page.mouse.move(nearby.x + nearby.width / 2, nearby.y + nearby.height / 2);
          await expect(popup).toBeVisible();
          await page.mouse.move(5, 5);
          await expect(popup).toHaveCount(0);
          await dialog.getByRole('button', { name: 'View page history', exact: true }).click();
          await expect(
            dialog.getByRole('list', { name: 'Recorded academic history' }),
          ).toBeVisible();
          const pages = dialog.getByRole('list', { name: 'Recorded academic history' });
          await expect(pages.locator('li')).toHaveCount(
            academicHistory(fixture, student.id, 'Math').filter((e) => e.kind === 'completion')
              .length,
          );
          await expect(pages).not.toContainText('Issued packet');
          await expect(pages.locator('li').first().locator('span')).toHaveText(
            /^[A-Z0-9]+[0-9]+.\d+$/,
          );
          await dialog.getByRole('button', { name: 'Show repeat history', exact: true }).click();
          await expect(dialog.getByRole('list', { name: 'Repeat history' })).toContainText(
            'D \u2192 C',
          );
          await expect(dialog.getByRole('list', { name: 'Repeat history' })).toContainText(
            'Fictional example',
          );
          await dialog.getByRole('combobox', { name: 'Academic period' }).selectOption('1 year');
          await expect(dialog.getByRole('list', { name: 'Repeat history' })).toContainText(
            'Fictional example',
          );
          expect(await dialog.locator('.academic-point').count()).toBeLessThanOrEqual(12);
          await dialog.getByRole('combobox', { name: 'Academic period' }).selectOption('1 week');
          await expect(dialog.getByRole('list', { name: 'Repeat history' })).not.toBeVisible();
          expect(
            (await dialog.locator('.academic-chart, .academic-empty-chart').boundingBox())!.height,
          ).toBe(440);
          await dialog.getByRole('combobox', { name: 'Academic period' }).selectOption('3 months');
          await expect(dialog.locator('.academic-level-labels')).toContainText(/\d+/);
          await dialog.getByRole('combobox', { name: 'Academic period' }).selectOption('All time');
        }
        if (title === 'Time spent at center') await expect(dialog).toContainText('45 min');
        if (title === 'Skill ratings') {
          await expect(dialog.getByRole('meter')).toHaveCount(3);
          await expect(dialog.locator('.skill-scatter-line')).toHaveCount(1);
          await expect(
            dialog.getByRole('list', { name: 'Recorded skill history' }),
          ).not.toBeVisible();
        }
        await page.screenshot({
          path: 'test-results/progress-' + title.split(' ')[0] + '-' + width + '.png',
        });
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(expand).toBeFocused();
      }
      await expect(page.getByRole('combobox')).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'Math', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      // Mixed and one-subject profiles retain the same four-card layout.
      await page.goto('/?view=students&student=' + fixture.students[1].id);
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await page.getByRole('tab', { name: 'Reading', exact: true }).click();
      await expect(
        page.getByRole('article', { name: 'Academic progress', exact: true }),
      ).toContainText('Kumon CONNECT');
      await expect(
        page.getByRole('article', { name: 'Homework consistency', exact: true }),
      ).toContainText('Kumon CONNECT');
      await expect(page.getByRole('article', { name: 'Skill ratings', exact: true })).toContainText(
        'No skill ratings recorded',
      );
      await page.goto('/?view=students&student=' + fixture.students[2].id);
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await expect(page.getByRole('tab')).toHaveCount(1);
      await expect(page.getByRole('tab', { name: 'Reading', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(writes).toBe(0);
      expect(JSON.stringify(snapshot)).toBe(before);
    },
  );

test('interactive Rowan has connected sampled history and navigable week, month and year windows', async ({
  page,
}) => {
  await login(page);
  const session = await state(page),
    now = new Date('2026-10-12T21:00:00Z');
  const fixture = academicProgressDemo(now);
  addInteractiveProgressStudent(fixture, now);
  await page.clock.install({ time: now });
  await page.route('**/api/state', (route) =>
    route.fulfill({
      json: {
        ...fixture,
        staff: session.staff,
        timezone: fixture.operations!.center.timezone,
        runtime: { demo: true, adapter: 'local', scheduler: false },
      },
    }),
  );
  await page.goto('/?view=students&student=' + progressStudentId);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: 'Open Academic progress' }).click();
  const dialog = page.getByRole('dialog', { name: 'Academic progress', exact: true });
  const period = dialog.getByRole('combobox', { name: 'Academic period' });
  await expect(dialog.locator('.academic-connection path')).toHaveAttribute('d', /L /);
  expect(await dialog.locator('.academic-point').count()).toBe(14);
  const initialGraph = (await dialog
    .locator('.academic-chart, .academic-empty-chart')
    .boundingBox())!;
  const initialPlot = (await dialog.locator('.academic-plot').boundingBox())!;
  for (const option of ['1 year', '6 months', '3 months', '1 month', '1 week']) {
    await period.selectOption(option);
    const range = await dialog.locator('.academic-period-nav span').innerText();
    await expect(dialog.getByRole('button', { name: 'Next academic period' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Previous academic period' }).click();
    await expect(dialog.locator('.academic-period-nav span')).not.toHaveText(range);
    const count = await dialog.locator('.academic-point').count();
    expect(count).toBeLessThanOrEqual(option === '1 week' ? 7 : option === '1 year' ? 12 : 14);
    expect(count).toBeGreaterThan(0);
    if (['6 months', '3 months', '1 month'].includes(option)) expect(count).toBe(14);
    const line = await dialog.locator('.academic-connection path').getAttribute('d');
    expect((line!.match(/L /g) || []).length).toBe(count - 1);
    if (option === '1 year') {
      const monthKeys = await dialog
        .locator('.academic-time-labels > span')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-date')!));
      const months = monthKeys.map((day) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)));
      const stride = months[1] - months[0];
      expect(months.slice(1).every((month, i) => month - months[i] === stride)).toBe(true);
      expect(monthKeys.every((day) => day.endsWith('-01'))).toBe(true);
    }
    const graph = (await dialog.locator('.academic-chart, .academic-empty-chart').boundingBox())!;
    expect(graph.height).toBe(440);
    expect(graph.width).toBeCloseTo(initialGraph.width, 0);
    const plot = (await dialog.locator('.academic-plot').boundingBox())!;
    expect(Math.abs(plot.height - initialPlot.height)).toBeLessThan(1);
    if (option === '1 week') {
      await expect(dialog.locator('.academic-grid-vertical')).toHaveCount(7);
      await expect(dialog.locator('.academic-level-labels')).toContainText(/\d+/);
    }
    await dialog.getByRole('button', { name: 'Next academic period' }).click();
    await expect(dialog.locator('.academic-period-nav span')).toHaveText(range);
  }
  await period.selectOption('All time');
  await dialog.getByRole('button', { name: 'Show repeat history' }).click();
  await expect(dialog.getByRole('list', { name: 'Repeat history' })).toContainText(
    'Fictional simulation',
  );
});

test('academic controls and both history actions fit without scrolling on laptop and phone heights', async ({
  page,
}) => {
  await login(page);
  const session = await state(page),
    now = new Date('2026-10-12T21:00:00Z');
  const fixture = academicProgressDemo(now);
  addInteractiveProgressStudent(fixture, now);
  await page.clock.install({ time: now });
  await page.route('**/api/state', (route) =>
    route.fulfill({
      json: {
        ...fixture,
        staff: session.staff,
        timezone: fixture.operations!.center.timezone,
        runtime: { demo: true, adapter: 'local', scheduler: false },
      },
    }),
  );
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 667 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/?view=students&student=' + progressStudentId);
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await page.getByRole('button', { name: 'Open Academic progress' }).click();
    const dialog = page.getByRole('dialog', { name: 'Academic progress', exact: true });
    const body = dialog.locator('.v3-modal-body');
    const frame = (await body.boundingBox())!;
    expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    for (const name of ['View page history', 'Show repeat history']) {
      const box = (await dialog.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(frame.y);
      expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const height = (await dialog.locator('.academic-chart').boundingBox())!.height;
    await dialog.getByRole('combobox', { name: 'Academic period' }).selectOption('1 week');
    expect((await dialog.locator('.academic-chart').boundingBox())!.height).toBe(height);
    expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `test-results/academic-fit-${viewport.width}-${viewport.height}.png`,
    });
    await page.keyboard.press('Escape');
  }
});
