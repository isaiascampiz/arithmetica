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
      await expect(card).toContainText('All skills average \u00b7 Last 8 weeks');
      await expect(card.locator('.skill-scatter-average')).toHaveCount(3);
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
      const summaries = ['Homework consistency', 'Time spent at center', 'Skill ratings'].map(
        (name) => page.getByRole('article', { name, exact: true }),
      );
      const headings = await Promise.all(
        summaries.map((c) => c.locator('h2').evaluate((el) => getComputedStyle(el).fontSize)),
      );
      expect(new Set(headings).size).toBe(1);
      const headlineStyles = await Promise.all(
        summaries.map((c) =>
          c
            .locator(
              '.homework-summary strong, .center-time-summary strong, .skill-scatter-headline',
            )
            .evaluate((el) => getComputedStyle(el).fontSize),
        ),
      );
      expect(new Set(headlineStyles).size).toBe(1);
      const homeworkPlot = (await summaries[0].locator('.homework-plot').boundingBox())!;
      expect(homeworkPlot.width).toBeCloseTo(skillPlot.width, 0);
      expect(homeworkPlot.height).toBeCloseTo(skillPlot.height, 0);
      const focus = skillSeries(fixture, progressStudentId).find((s) => s.id === 'focus')!;
      const expected = skillAverage(
        focus.records.filter((r) => r.day >= '2026-08-24' && r.day <= '2026-10-12'),
      )!;
      await expect(
        card.getByRole('meter', { name: 'Concentration average', exact: true }),
      ).toHaveAttribute('aria-valuenow', String(expected));
      const number = card.getByRole('meter').first();
      await expect(
        card.getByRole('meter', { name: 'All skills average', exact: true }),
      ).toBeVisible();
      await expect(card).not.toContainText(/\d+ recorded ratings/);
      expect(await number.locator('small').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
        await number.evaluate((el) => getComputedStyle(el).fontSize),
      );
      expect(await number.locator('small').evaluate((el) => getComputedStyle(el).fontWeight)).toBe(
        '400',
      );
      expect(
        await card
          .locator('.skill-scatter-caption')
          .evaluate((el) => getComputedStyle(el).fontSize),
      ).toBe(
        await page
          .locator('.center-time-context .progress-context')
          .first()
          .evaluate((el) => getComputedStyle(el).fontSize),
      );
      expect(
        await card
          .locator('.skill-scatter-summary')
          .first()
          .evaluate((el) => getComputedStyle(el).fontSize),
      ).toBe(
        await page
          .locator('.homework-legend')
          .first()
          .evaluate((el) => getComputedStyle(el).fontSize),
      );
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
      const heightBeforePins = (await dialog.boundingBox())!.height;
      const period = dialog.getByRole('combobox', { name: 'Skills period' });
      const summary = dialog.locator('.skill-scatter-summary-panel');
      await expect(dialog.locator('.skill-scatter-pin')).toHaveCount(0);
      await expect(dialog).not.toContainText(/\d+ recorded ratings/);
      await expect(dialog.getByRole('button', { name: 'Show all', exact: true })).toHaveCount(0);
      expect(await summary.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
      const viewTrigger = dialog.getByRole('button', { name: 'Skills view', exact: true });
      await expect(viewTrigger).toContainText('All skills average');
      const triggerBox = (await viewTrigger.boundingBox())!;
      await viewTrigger.click({ position: { x: 3, y: triggerBox.height - 3 } });
      await expect(
        dialog.getByRole('group', { name: 'Skill views and preview pins' }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await viewTrigger.click({ position: { x: triggerBox.width - 3, y: 3 } });
      await expect(
        dialog.getByRole('group', { name: 'Skill views and preview pins' }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog.locator('.progress-period > span')).not.toBeVisible();
      const skillView = {
        selectOption: async (option: string | { label: string }) => {
          await viewTrigger.click();
          if (typeof option === 'string' && option) {
            const buttons = dialog.locator('.skill-view-row');
            for (const r of await buttons.all())
              if ((await r.getAttribute('data-skill-key')) === option) {
                await r.locator('.skill-view-option').click();
                return;
              }
            throw new Error('Missing skill key: ' + option);
          }
          await dialog
            .getByRole('button', {
              name: typeof option === 'string' ? 'All skills average' : option.label,
              exact: true,
            })
            .click();
        },
      };
      await expect(period).toHaveValue('8 weeks');
      await expect(dialog.locator('.skill-scatter-chart')).toHaveCount(1);
      await expect(dialog.getByRole('list', { name: 'Recorded skill history' })).not.toBeVisible();
      const dates = dialog.locator('.skill-scatter-target');
      await dates.first().focus();
      const earlyTip = (await dialog.getByRole('tooltip').boundingBox())!;
      await dates.last().focus();
      const lateTip = (await dialog.getByRole('tooltip').boundingBox())!;
      if (viewport.width > 760) expect(lateTip.x).toBeGreaterThan(earlyTip.x);
      const tipFrame = (await dialog.locator('.skill-scatter-plot').boundingBox())!;
      expect(lateTip.x).toBeGreaterThanOrEqual(tipFrame.x - 1);
      expect(lateTip.x + lateTip.width).toBeLessThanOrEqual(tipFrame.x + tipFrame.width + 1);
      await page.keyboard.press('Escape');
      const paths = dialog.locator('.skill-scatter-line');
      await expect(paths).toHaveCount(1);
      await skillView.selectOption({ label: 'Concentration' });
      await expect(paths).toHaveCount(1);
      await expect(dialog.locator('.skill-scatter-area')).toHaveCount(1);
      await skillView.selectOption({ label: 'Handwriting' });
      await expect(paths).toHaveCount(1);
      await expect(paths).toHaveAttribute('data-skill', 'handwriting');
      await skillView.selectOption({ label: 'Concentration' });
      await viewTrigger.click();
      const editor = dialog.locator('.skill-view-options');
      expect(await editor.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
      await expect(editor).toContainText('3 of 3 pinned');
      await expect(
        dialog.getByRole('button', { name: 'Pin Confidence to preview', exact: true }).first(),
      ).toBeDisabled();
      expect((await dialog.boundingBox())!.height).toBe(heightBeforePins);
      const marker = dialog.locator('.skill-view-option i').first();
      expect(await marker.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('2px');
      expect(await marker.evaluate((el) => getComputedStyle(el).width)).toBe('9px');
      const pinColors = await dialog
        .locator('.skill-scatter-pin')
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
      expect(new Set(pinColors).size).toBe(1);
      await dialog
        .getByRole('button', { name: 'Pin Concentration to preview', exact: true })
        .click();
      await expect(
        dialog.getByRole('button', { name: 'Pin Concentration to preview', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(card.locator('.skill-scatter-average')).toHaveCount(2);
      const expectCenteredPins = async () => {
        const box = (await card.locator('.skill-scatter-averages').boundingBox())!;
        const rows = await card.locator('.skill-scatter-average').all();
        const first = (await rows[0].boundingBox())!,
          last = (await rows.at(-1)!.boundingBox())!;
        expect((first.y + last.y + last.height) / 2).toBeCloseTo(box.y + box.height / 2, 1);
      };
      await expectCenteredPins();
      await card.click();
      await viewTrigger.click();
      await dialog.getByRole('button', { name: 'Pin Handwriting to preview', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(card.locator('.skill-scatter-average')).toHaveCount(1);
      await expectCenteredPins();
      await card.click();
      await viewTrigger.click();
      await dialog.getByRole('button', { name: 'Pin Handwriting to preview', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(card.locator('.skill-scatter-line')).toHaveAttribute('points', previewAverage!);
      await expect(card.locator('.skill-scatter-series[data-skill="focus"]')).toHaveCount(0);
      await card.click();
      await expect(dialog.locator('.skill-scatter-pin')).toHaveCount(0);
      await viewTrigger.click();
      await expect(
        dialog.getByRole('button', { name: 'Pin Concentration to preview', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
      await dialog
        .getByRole('button', { name: 'Pin Concentration to preview', exact: true })
        .click();
      await page.keyboard.press('Escape');
      await expect(dialog.locator('.skill-scatter-pin')).toHaveCount(0);
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
      await skillView.selectOption('');
      await expect(paths).toHaveCount(1);
      await expect(paths).toHaveAttribute('data-skill', 'overall-average');
      if (viewport.width > 760)
        expect((await dialog.locator('.skill-scatter-chart').boundingBox())!.height).toBe(310);
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
      await skillView.selectOption(
        skillSeries(fixture, progressStudentId).find((s) => s.id === 'old-confidence')!.key,
      );
      await expect(
        dialog.locator('.skill-scatter-series[data-skill="old-confidence"] .skill-scatter-dot'),
      ).toHaveCount(1);
      await skillView.selectOption(
        skillSeries(fixture, progressStudentId).find((s) => s.id === 'new-confidence')!.key,
      );
      await expect(
        dialog.locator('.skill-scatter-series[data-skill="new-confidence"] .skill-scatter-dot'),
      ).toHaveCount(1);
      await skillView.selectOption('');
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
      await viewTrigger.click();
      const rows = dialog.locator('.skill-view-row');
      const oldKey = skillSeries(fixture, progressStudentId).find(
        (s) => s.id === 'old-confidence',
      )!.key;
      const rowIndex = await rows.evaluateAll(
        (els, key) => els.findIndex((el) => el.getAttribute('data-skill-key') === key),
        oldKey,
      );
      const extraPin = rows.nth(rowIndex).locator('.skill-scatter-pin');
      await expect(extraPin).toBeDisabled();
      await dialog
        .getByRole('button', { name: 'Pin Concentration to preview', exact: true })
        .click();
      await expect(extraPin).toBeEnabled();
      await extraPin.click();
      await expect(extraPin).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      // The historical skill has no ratings in the eight-week preview; no average is invented.
      await expect(card.locator('.skill-scatter-average')).toHaveCount(2);
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
