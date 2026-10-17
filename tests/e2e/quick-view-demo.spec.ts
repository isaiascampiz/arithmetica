import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';
import { currentSets } from '../../src/lib/v3-planning';
import { isOpenVisit, type Snapshot } from '../../src/lib/model';

test('fictional Quick View demo shows incoming packets, unfinished packet movement and read-only outgoing details', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    });
  });
  await login(page);
  const session = await state(page),
    now = new Date('2026-10-12T21:00:00Z'),
    fixture = quickViewDemo(now),
    snapshot: Snapshot = {
      ...fixture,
      staff: session.staff,
      timezone: fixture.operations!.center.timezone,
      runtime: { demo: true, adapter: 'local', scheduler: false },
    };
  const before = JSON.stringify(fixture);
  await page.clock.install({ time: now });
  await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/commands')) writes++;
  });
  await page.reload();
  await expect(page.locator('.center-switch')).toContainText('FICTIONAL Quick View demo');
  const dialog = page.getByRole('dialog');
  for (const [index, student] of fixture.students.entries()) {
    const visit = fixture.visits.find((v) => v.studentId === student.id && isOpenVisit(v))!;
    await page.locator('[data-visit-id="' + visit.id + '"]').click();
    await expect(dialog.getByRole('heading', { name: student.name, exact: true })).toBeVisible();
    await expect(dialog.locator('.quick-student-identity')).toContainText(
      'Waited: ' + (24 + index * 5) + ' minutes',
    );
    await expect(dialog.getByRole('tab')).toHaveCount(index === 2 ? 1 : 2);
    const confirm = dialog.getByRole('button', { name: /Check in (Math|Reading)/ });
    await expect(confirm).toBeEnabled();
    const panel = dialog.locator('[role="tabpanel"]:visible');
    await expect(panel.getByRole('heading', { name: 'Incoming homework' })).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Mark unfinished / })).toHaveCount(
      index === 1 ? 4 : 2,
    );
    await expect(panel.getByRole('heading', { name: /Math|Reading/ })).toHaveCount(0);
    await expect(panel.locator('.quick-outgoing-heading')).toContainText(
      index === 0 ? 'Prepared' : 'Not prepared',
    );
    await expect(dialog.getByRole('heading', { name: 'Skill ratings' })).toBeVisible();
    await expect(dialog.getByRole('slider')).toHaveCount(3);
    await expect(dialog).not.toContainText('Slide to rate');
    await expect(dialog.locator('.quick-note label')).toHaveCount(0);
    await expect(dialog.getByLabel('Optional instructor note')).toHaveCount(1);
    if (index === 0) {
      const focus = dialog.getByRole('slider', { name: 'Focus rating' });
      await focus.fill('4');
      await dialog.getByRole('button', { name: 'Customize', exact: true }).click();
      await dialog.getByRole('button', { name: 'Move Focus down' }).click();
      await expect(focus).toHaveValue('4');
      await dialog.getByRole('button', { name: '+ Add custom', exact: true }).click();
      await dialog
        .getByRole('textbox', { name: 'Custom observation skill' })
        .fill('Following instructions');
      await dialog.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(dialog.getByRole('slider')).toHaveCount(4);
      await focus.fill('0');
      await expect(focus).toHaveAttribute('aria-valuetext', 'Not rated');
      await dialog.getByRole('button', { name: 'Customize', exact: true }).click();
    }
    await expect(
      dialog.getByRole('button', { name: 'Customize observation shortcuts' }),
    ).toHaveCount(0);
    const outgoingCards = panel.getByRole('list', { name: 'Outgoing homework packets' });
    await expect(outgoingCards.getByRole('button')).toHaveCount(0);
    const originalOutgoing = await outgoingCards.getByRole('listitem').allTextContents();
    await outgoingCards.getByRole('listitem').first().click();
    await expect(panel.getByRole('region', { name: 'Packet details' })).toHaveCount(0);
    await expect(outgoingCards.getByRole('listitem')).toHaveText(originalOutgoing);
    const firstIncoming = panel.getByRole('button', { name: /^Mark unfinished / }).first();
    const range = await firstIncoming.innerText();
    await firstIncoming.click();
    const returned = panel.getByRole('button', { name: 'Undo unfinished ' + range, exact: true });
    await expect(returned).toHaveClass(/unfinished/);
    await expect(panel.locator('[aria-label="Today\'s packet"] .packet-chip')).toHaveText(range);
    await expect(panel.getByRole('button', { name: /^Mark unfinished / })).toHaveCount(
      index === 1 ? 3 : 1,
    );
    await returned.click();
    if (index === 0) {
      const cards = panel.getByRole('button', { name: /^Mark unfinished / });
      const ranges = await cards.allTextContents();
      const originalCenter = await panel
        .locator('[aria-label="Today\'s packet"] .packet-chip')
        .innerText();
      await cards.nth(1).click();
      await cards.first().click();
      await expect(panel.locator('[aria-label="Today\'s packet"] .packet-chip')).toHaveText(
        ranges[0],
      );
      await expect(panel.locator('.quick-outgoing-cards [role="listitem"] > span')).toHaveText([
        ranges[1],
        originalCenter,
      ]);
      await expect(panel.locator('.quick-held-packets button')).toHaveCount(2);
      for (const held of await panel.locator('.quick-held-packets button').all())
        await expect(held).toBeDisabled();
      await expect(panel.locator('.quick-outgoing-cards')).toContainText('Returned packet');
      await expect(panel.locator('.quick-outgoing-cards')).toContainText('Pull');
      await panel.getByRole('button', { name: 'Both', exact: true }).click();
      await expect(panel.locator('.quick-outgoing-cards [role="listitem"] > span')).toHaveText([
        ranges[1],
        originalCenter,
      ]);
      await panel.getByRole('button', { name: 'Corrections', exact: true }).click();
      await expect(panel.locator('[aria-label="Today\'s packet"]')).toHaveCount(0);
      await expect(panel.locator('.quick-outgoing-cards [role="listitem"] > span')).toHaveText(
        ranges,
      );
      await expect(panel.locator('.quick-held-packets button')).toHaveCount(3);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: 'test-results/quick-view-shift-phone.png' });
      for (const range of ranges)
        await panel.getByRole('button', { name: 'Undo unfinished ' + range, exact: true }).click();
      await panel.getByRole('button', { name: 'Packet', exact: true }).click();
      const activityBox = (await panel.locator('.activity-choices').boundingBox())!,
        centerBox = (await panel.locator('[aria-label="Today\'s packet"]').boundingBox())!;
      const explanationBox = (await panel
        .locator('.quick-in-center .quick-directions')
        .boundingBox())!;
      expect(activityBox.y + activityBox.height).toBeLessThan(explanationBox.y);
      expect(explanationBox.y + explanationBox.height).toBeLessThan(centerBox.y);
      for (const range of ranges)
        await panel.getByRole('button', { name: 'Mark unfinished ' + range, exact: true }).click();
      const beforeAdjustment = await panel
        .locator('.quick-outgoing-cards [role="listitem"] > span')
        .allTextContents();
      await panel.getByRole('button', { name: 'Adjust', exact: true }).click();
      await expect(
        panel.getByRole('button', { name: 'Confirm adjustment', exact: true }),
      ).toBeDisabled();
      await expect(
        dialog.getByRole('button', { name: 'Check in Math', exact: true }),
      ).toBeDisabled();
      const queue = panel.getByRole('table', { name: 'Packet adjustment queue' });
      await expect(queue.getByRole('columnheader', { name: 'Level', exact: true })).toHaveCount(1);
      await expect(queue.locator('.today-row')).toContainText('Today');
      await expect(queue.getByRole('heading')).toHaveCount(0);
      await panel.getByLabel('Math in-center packet start', { exact: true }).fill('11');
      await panel.getByLabel('Math in-center packet end', { exact: true }).fill('15');
      await expect(panel.getByLabel('Math packet 1 start', { exact: true })).toHaveValue('16');
      await expect(panel.getByLabel('Math packet 2 start', { exact: true })).toHaveValue('21');
      await expect(panel.locator('.quick-outgoing-cards [role="listitem"] > span')).toHaveText(
        beforeAdjustment,
      );
      await expect(panel.getByRole('button', { name: 'Dictate', exact: true })).toBeVisible();
      await panel
        .getByLabel('Adjustment reason', { exact: true })
        .fill('Fictional earlier classwork position');
      await page.screenshot({ path: 'test-results/quick-view-adjust-phone.png' });
      await panel.getByRole('button', { name: 'Confirm adjustment', exact: true }).click();
      await expect(panel.locator('.quick-plan-editor')).toHaveCount(0);
      await expect(panel.locator('[aria-label="Today\'s packet"] .packet-chip')).toHaveText(
        'D11–15',
      );
      await expect(panel.locator('.quick-outgoing-cards [role="listitem"] > span')).toHaveText(
        ranges,
      );
      await expect(panel.locator('.quick-outgoing-cards')).toContainText('Reuse existing packet');
      await panel.getByRole('button', { name: 'Reset', exact: true }).click();
      for (const range of ranges)
        await panel.getByRole('button', { name: 'Undo unfinished ' + range, exact: true }).click();
      await panel.getByRole('button', { name: 'Adjust', exact: true }).click();
      await panel.getByLabel('Math packet 1 start', { exact: true }).fill('80');
      await panel.getByLabel('Math packet 1 end', { exact: true }).fill('84');
      await panel.getByRole('button', { name: 'Remove packet 2', exact: true }).click();
      await panel
        .getByLabel('Adjustment reason', { exact: true })
        .fill('Fictional homework-only adjustment');
      await panel.getByRole('button', { name: 'Confirm adjustment', exact: true }).click();
      await expect(panel.locator('[aria-label="Today\'s packet"] .packet-chip')).toHaveText(
        originalCenter,
      );
      await expect(panel.locator('.quick-outgoing-cards [role="listitem"] > span')).toHaveText([
        'D80–84',
      ]);
      await panel.getByRole('button', { name: 'Reset', exact: true }).click();
      await panel.getByRole('button', { name: 'Repeat', exact: true }).click();
      const todayChoice = panel.getByRole('button', { name: "Today's packet", exact: true }),
        homeworkChoice = panel.getByRole('button', { name: 'Homework', exact: true });
      await expect(panel.getByRole('radio')).toHaveCount(0);
      await homeworkChoice.click();
      await expect(homeworkChoice).toHaveAttribute('aria-pressed', 'true');
      await expect(todayChoice).toHaveAttribute('aria-pressed', 'false');
      const choiceBoxes = await panel
        .locator('.quick-repeat-options button')
        .evaluateAll((elements) => elements.map((e) => e.getBoundingClientRect().y));
      expect(choiceBoxes[0]).toBe(choiceBoxes[1]);
      await panel.getByLabel('Starting worksheet/page', { exact: true }).fill('1');
      await panel
        .getByLabel('Repeat reason', { exact: true })
        .fill('Fictional homework-only review');
      await expect(panel.getByRole('button', { name: 'Dictate', exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Dictate', exact: true }).click();
      await expect(panel.getByRole('status')).toContainText('Dictation unavailable');
      await expect(panel.getByLabel('Repeat reason', { exact: true })).toHaveValue(
        'Fictional homework-only review',
      );
      await expect(panel.getByLabel('Repeat reason', { exact: true })).toBeVisible();
      const dictatedReason = panel.locator('.quick-plan-editor .dictated-note');
      await expect(dictatedReason).toHaveCSS('display', 'grid');
      await expect(dictatedReason.locator('small')).toHaveCSS('display', 'block');
      const reasonFonts = await dictatedReason.evaluate((element) => ({
        label: parseFloat(getComputedStyle(element.querySelector('label')!).fontSize),
        button: parseFloat(getComputedStyle(element.querySelector('button')!).fontSize),
      }));
      expect(reasonFonts.button).toBeLessThan(reasonFonts.label);
      const reasonHeight = await panel
        .getByLabel('Repeat reason', { exact: true })
        .evaluate((element) => element.getBoundingClientRect().height);
      expect(reasonHeight).toBeGreaterThanOrEqual(44);
      const confirmRepeat = panel.getByRole('button', { name: 'Confirm repeat plan', exact: true });
      await expect(confirmRepeat).toHaveClass('primary');
      const reasonBeforeConfirm = await panel
        .locator('.quick-plan-editor')
        .evaluate(
          (element) =>
            !!(
              element
                .querySelector('textarea')!
                .compareDocumentPosition(element.querySelector('.quick-editor-confirm')!) & 4
            ),
        );
      expect(reasonBeforeConfirm).toBe(true);
      await page.screenshot({ path: 'test-results/quick-view-repeat-phone.png' });
      await confirmRepeat.click();
      await expect(panel.locator('[aria-label="Today\'s packet"] .packet-chip')).toHaveText(
        originalCenter,
      );
      await expect(panel.locator('.quick-outgoing-cards [role="listitem"] > span')).toHaveText([
        'D1–5',
        'D6–10',
      ]);
      await panel.getByRole('button', { name: 'Reset', exact: true }).click();
    }
    if (index === 2) {
      const tab = (await dialog.getByRole('tab').boundingBox())!,
        tabs = (await dialog.getByRole('tablist').boundingBox())!;
      expect(tab.width).toBeLessThan(tabs.width * 0.8);
    }
    await expect(dialog.locator('.quick-context .mode-tag')).toHaveCount(0);
    await expect(dialog).not.toContainText(
      /previously issued|completion not assessed|permanent progression|restart/i,
    );
    if (index === 0) {
      for (const width of [1024, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await dialog.getByRole('tab', { name: 'Math', exact: true }).click();
        await dialog.locator('.v3-modal-body').evaluate((element) => {
          element.scrollTop = 0;
        });
        const active = (await dialog
            .getByRole('tab', { name: 'Math', exact: true })
            .boundingBox())!,
          inactive = (await dialog
            .getByRole('tab', { name: 'Reading', exact: true })
            .boundingBox())!;
        expect(active.y).toBe(inactive.y);
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        await page.screenshot({ path: `test-results/quick-view-browser-tabs-${width}.png` });
        const observations = dialog.getByRole('region', { name: 'Skill ratings' });
        await observations.scrollIntoViewIfNeeded();
        expect(
          await observations.evaluate((element) => element.scrollWidth <= element.clientWidth),
        ).toBe(true);
        await page.screenshot({ path: `test-results/quick-view-observations-${width}.png` });
      }
    }
    if (index < 2) {
      const before = (await dialog.boundingBox())!;
      await dialog.getByRole('tab', { name: 'Reading', exact: true }).click();
      const after = (await dialog.boundingBox())!;
      expect(after.height).toBe(before.height);
      expect(after.width).toBe(before.width);
      await expect(dialog.locator('.quick-pinned-context')).toHaveCSS('position', 'static');
      await expect(confirm).toBeEnabled();
      if (index === 1)
        await expect(dialog.locator('[role="tabpanel"]:visible')).toContainText(
          'Assignments are managed in Kumon CONNECT',
        );
    }
    await page.keyboard.press('Escape');
  }
  expect(writes).toBe(0);
  expect(JSON.stringify(fixture)).toBe(before);
  expect(
    currentSets(
      fixture,
      fixture.visits.find((v) => v.studentId === fixture.students[0].id && isOpenVisit(v))!,
    ).every((a) => !a.v3!.issuedAt),
  ).toBe(true);
});
