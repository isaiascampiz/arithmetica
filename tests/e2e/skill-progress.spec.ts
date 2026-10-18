import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { addFictionalSkillTransitions } from '../fixtures/skill-progress-demo';
import { skillSeries, skillAverage } from '../../src/lib/skill-progress';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import {
  addInteractiveProgressStudent,
  progressStudentId,
} from '../fixtures/interactive-progress-student';
import type { Snapshot, Observation } from '../../src/lib/model';
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 667 },
  { width: 320, height: 568 },
])
  test(
    'skill trends preserve identities, revisions and gaps at ' + viewport.width,
    async ({ page }) => {
      await page.setViewportSize(viewport);
      await login(page);
      const session = await state(page),
        now = new Date('2026-10-12T21:00:00Z'),
        fixture = quickViewDemo(now);
      addInteractiveProgressStudent(fixture, now);
      addFictionalSkillTransitions(fixture, now);
      fixture.operations!.students[progressStudentId].observationSkills = [
        { id: 'focus', label: 'Concentration' },
        { id: 'handwriting', label: 'Handwriting' },
        { id: 'independence', label: 'Independence' },
        { id: 'new-confidence', label: 'Confidence' },
      ];
      for (const o of fixture.observations.filter(
        (o) => o.studentId === progressStudentId && o.createdAt >= '2026-10-01',
      ))
        o.skillRatings = o.skillRatings?.filter((r) => r.id !== 'focus');
      const observation = (
        id: string,
        day: string,
        skillRatings: Observation['skillRatings'],
      ): Observation => ({
        id,
        studentId: progressStudentId,
        visitId: null,
        createdAt: day + 'T21:00:00Z',
        author: 'Fictional Instructor',
        text: '',
        choices: [],
        followUp: false,
        reviewedAt: null,
        reviewedBy: null,
        skillRatings,
      });
      const corrected = observation('fictional-corrected', '2026-10-05', [
        { id: 'focus', label: 'Focus', score: 1 },
      ]);
      corrected.revisions = [
        {
          at: '2026-10-11T21:00:00Z',
          actor: 'Fictional Reviewer',
          text: '',
          skillRatings: [{ id: 'focus', label: 'Focus', score: 4 }],
        },
      ];
      fixture.observations.push(
        corrected,
        observation('fictional-new', '2026-10-06', [
          { id: 'focus', label: 'Concentration', score: 2 },
          { id: 'new-confidence', label: 'Confidence', score: 5 },
        ]),
        observation('fictional-retired', '2026-05-05', [
          { id: 'old-confidence', label: 'Confidence', score: 3 },
        ]),
      );
      const snapshot: Snapshot = {
        ...fixture,
        staff: session.staff,
        timezone: fixture.operations!.center.timezone,
        runtime: { demo: true, adapter: 'local', scheduler: false },
      };
      const before = JSON.stringify(snapshot);
      let writes = 0;
      page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().endsWith('/api/commands')) writes++;
      });
      await page.clock.install({ time: now });
      await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
      await page.goto('/?view=students&student=' + progressStudentId);
      await page.getByRole('button', { name: 'Progress', exact: true }).click();

      const card = page.getByRole('article', { name: 'Skill ratings', exact: true });
      await expect(card.locator('.skill-scatter-chart')).toHaveCount(1);
      await expect(card.locator('.skill-scatter-y span')).toHaveText(['1', '2', '3', '4', '5']);
      expect((await card.locator('.skill-scatter-chart').boundingBox())!.height).toBe(
        (await page
          .getByRole('article', { name: 'Time spent at center', exact: true })
          .locator('.center-time-chart')
          .boundingBox())!.height,
      );
      await expect(card).toContainText('3 months');
      await expect(card.locator('.skill-scatter-average')).toHaveCount(4);
      await expect(card.locator('.skill-scatter-pin')).toHaveCount(0);
      await expect(card.locator('.skill-scatter-choice')).toHaveCount(0);
      await expect(card.locator('.skill-scatter-line')).toHaveCount(1);
      await expect(card.locator('.skill-scatter-line')).toHaveAttribute(
        'data-skill',
        'overall-average',
      );
      const previewAverage = await card.locator('.skill-scatter-line').getAttribute('points');
      const skillPlot = (await card.locator('.skill-scatter-plot').boundingBox())!;
      const timePlot = (await page
        .getByRole('article', { name: 'Time spent at center', exact: true })
        .locator('.center-time-plot')
        .boundingBox())!;
      expect(skillPlot.width).toBeCloseTo(timePlot.width, 0);
      expect(skillPlot.height).toBeCloseTo(timePlot.height, 0);
      if (viewport.width > 760) expect(skillPlot.y).toBeCloseTo(timePlot.y, 0);
      const focus = skillSeries(fixture, progressStudentId).find((s) => s.id === 'focus')!;
      const expected = skillAverage(
        focus.records.filter((r) => r.day >= '2026-08-01' && r.day <= '2026-10-12'),
      )!;
      await expect(
        card.getByRole('meter', { name: 'Concentration average', exact: true }),
      ).toHaveAttribute('aria-valuenow', String(expected));
      const preview = await card.textContent();
      await page.getByRole('tab', { name: 'Reading', exact: true }).click();
      await expect(card).toHaveText(preview!);
      await page.screenshot({
        path: 'test-results/skills-preview-' + viewport.width + '.png',
        fullPage: true,
      });
      await card.click();
      const dialog = page.getByRole('dialog', { name: 'Skill ratings', exact: true });
      await expect(dialog).toBeVisible();
      const period = dialog.getByRole('combobox', { name: 'Skills period' });
      await expect(period).toHaveValue('3 months');
      await expect(dialog.locator('.skill-scatter-chart')).toHaveCount(1);
      await expect(dialog.getByRole('list', { name: 'Recorded skill history' })).not.toBeVisible();
      const paths = dialog.locator('.skill-scatter-line');
      await expect(paths).toHaveCount(1);
      await expect(
        dialog.getByRole('button', { name: 'Show average', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await dialog.getByRole('button', { name: 'Show Concentration skill', exact: true }).click();
      await expect(paths).toHaveCount(1);
      await expect(dialog.locator('.skill-scatter-area')).toHaveCount(1);
      const fill = dialog.locator('.skill-scatter-area');
      expect(Number(await fill.evaluate((el) => getComputedStyle(el).fillOpacity))).toBeLessThan(
        0.2,
      );
      await expect(
        dialog.getByRole('button', { name: 'Show Concentration skill', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await dialog.getByRole('button', { name: 'Show Handwriting skill', exact: true }).focus();
      await page.keyboard.press('Space');
      await expect(paths).toHaveCount(2);
      await dialog.getByRole('button', { name: 'Show all', exact: true }).click();
      const colors = await paths.evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
      expect(new Set(colors).size).toBe(colors.length);
      await dialog
        .getByRole('button', { name: 'Pin Concentration to preview', exact: true })
        .click();
      await expect(
        dialog.getByRole('button', { name: 'Pin Concentration to preview', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('Escape');
      await expect(card.locator('.skill-scatter-average')).toHaveCount(3);
      await expect(card.locator('.skill-scatter-line')).toHaveAttribute('points', previewAverage!);
      await expect(card.locator('.skill-scatter-series[data-skill="focus"]')).toHaveCount(0);
      await card.click();
      await expect(
        dialog.getByRole('button', { name: 'Pin Concentration to preview', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
      await dialog
        .getByRole('button', { name: 'Pin Concentration to preview', exact: true })
        .click();
      const focusColor = await dialog
        .locator('.skill-scatter-series[data-skill="focus"]')
        .getAttribute('data-color');
      await period.selectOption('1 week');
      await expect(dialog).toContainText('No skill ratings recorded in this period.');
      await dialog.getByRole('button', { name: 'Previous skills period' }).click();
      await expect(
        dialog.getByRole('meter', { name: 'Concentration average', exact: true }),
      ).toHaveAttribute('aria-valuenow', '3');
      const focusDots = dialog.locator(
        '.skill-scatter-series[data-skill="focus"] .skill-scatter-dot',
      );
      await expect(focusDots).toHaveCount(2);
      const point = dialog.getByRole('button', {
        name: 'View skill ratings for Oct 5, 2026',
        exact: true,
      });
      await point.focus();
      await page.keyboard.press('Enter');
      const popup = dialog.getByRole('tooltip', { name: 'Skill rating snapshot' });
      await expect(popup).toBeVisible();
      await expect(popup).toContainText('Oct 5, 2026');
      await expect(popup).toContainText('Focus');
      await expect(popup).toContainText('4/5');
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(dialog).toBeVisible();
      const box = (await focusDots.last().boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(popup).toContainText('Oct 6, 2026');
      await expect(popup).toContainText('Concentration');
      await expect(popup).toContainText('2/5');
      await dialog.getByRole('heading', { name: 'Skill ratings', exact: true }).click();
      await expect(popup).toHaveCount(0);
      await period.selectOption('1 month');
      await expect(
        dialog.getByRole('meter', { name: 'Concentration average', exact: true }),
      ).toHaveAttribute('aria-valuenow', '3');
      await expect(dialog.locator('.skill-scatter-series[data-skill="focus"]')).toHaveAttribute(
        'data-color',
        focusColor!,
      );
      await dialog.getByRole('button', { name: 'Show average', exact: true }).click();
      await expect(paths).toHaveCount(1);
      await expect(paths).toHaveAttribute('data-skill', 'overall-average');
      if (viewport.width > 760)
        expect(
          (await dialog.locator('.skill-scatter-chart').boundingBox())!.height,
        ).toBeGreaterThan(300);
      await page.screenshot({ path: 'test-results/skills-detail-' + viewport.width + '.png' });
      if (viewport.width > 760)
        expect(
          await dialog
            .locator('.v3-modal-body')
            .evaluate((el) => el.scrollHeight - el.clientHeight),
        ).toBeLessThanOrEqual(1);
      await period.selectOption('1 year');
      const range = await dialog.locator('.skill-scatter-period-nav span').textContent();
      await dialog.getByRole('button', { name: 'Previous skills period' }).click();
      await expect(dialog.locator('.skill-scatter-period-nav span')).not.toHaveText(range!);
      await dialog.getByRole('button', { name: 'Next skills period' }).click();
      await expect(dialog.locator('.skill-scatter-period-nav span')).toHaveText(range!);
      await period.selectOption('All time');
      await dialog.getByRole('button', { name: 'Show all', exact: true }).click();
      await expect(
        dialog.locator('.skill-scatter-series[data-skill="old-confidence"] .skill-scatter-dot'),
      ).toHaveCount(1);
      await expect(
        dialog.locator('.skill-scatter-series[data-skill="new-confidence"] .skill-scatter-dot'),
      ).toHaveCount(1);
      await dialog.getByRole('button', { name: 'Skill record history', exact: true }).click();
      const history = dialog.getByRole('list', { name: 'Recorded skill history' });
      await expect(history).toContainText('Fictional Reviewer');
      await expect(history).toContainText('Focus');
      const day = history
        .locator('li')
        .filter({ has: page.getByText('Oct 5, 2026', { exact: true }) });
      await expect(day).toContainText('Handwriting');
      await expect(day).toContainText('Focus');
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(writes).toBe(0);
      expect(JSON.stringify(snapshot)).toBe(before);
      const extraPin = dialog.locator(
        '.skill-scatter-average[data-skill="old-confidence"] .skill-scatter-pin',
      );
      await extraPin.click();
      await expect(extraPin).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Escape');
      await expect(card.locator('.skill-scatter-average')).toHaveCount(4);
      const empty = structuredClone(snapshot);
      empty.observations = [];
      await page.route('**/api/state', (route) => route.fulfill({ json: empty }));
      await page.reload();
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await expect(card.getByRole('meter')).toHaveCount(0);
      await expect(card).toContainText('No skill ratings recorded');
      await expect(card.locator('.skill-scatter-dot')).toHaveCount(0);
    },
  );
