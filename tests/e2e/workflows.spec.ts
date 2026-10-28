import { test, expect } from '@playwright/test';
import { login, state, learner, arrive, physical, openProfile, command, prepare } from './helpers';
test('instructor notes and existing follow-up survive checkout/reload and review', async ({
  page,
}) => {
  await login(page, 'instructor');
  const s = await learner(page, 'CONNECT'),
    v = await arrive(page, s.id);
  const existingFollowUp = 'Existing fictional follow-up ' + Date.now();
  await command(page, 'v3', {
    action: 'observation',
    visitId: v.id,
    choices: [],
    text: existingFollowUp,
    followUp: true,
  });
  await page.reload();
  await page.locator('[data-visit-id="' + v.id + '"]').click();
  const dialog = page.getByRole('dialog');
  const note = 'Fictional regression observation ' + Date.now();
  await dialog.getByLabel('Instructional note').fill(note);
  await expect(dialog.getByLabel('Follow-up needed')).toHaveCount(0);
  await dialog.getByRole('button', { name: /Check in (Math|Reading)/ }).click();
  await expect(dialog).toHaveCount(0);
  await physical(page, s.id, 'out');
  await page.reload();
  await openProfile(page, s.name);
  await page.getByRole('button', { name: 'Visit History', exact: true }).click();
  await page.getByRole('button', { name: 'View session', exact: true }).click();
  const newNote = page.locator('.history-note').filter({ hasText: note });
  await expect(newNote).toBeVisible();
  await expect(newNote).not.toContainText('Follow-up');
  const card = page.locator('.history-note').filter({ hasText: existingFollowUp });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Follow-up');
  await expect(card.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Visit History', exact: true }).click();
  await page.getByRole('button', { name: 'View session', exact: true }).click();
  await expect(page.locator('.history-note').filter({ hasText: existingFollowUp })).toContainText(
    existingFollowUp,
  );
});
test('kiosk manual flow is idempotent and cannot read staff records', async ({ page }) => {
  await login(page);
  const s = await learner(page, 'CONNECT'),
    db = await state(page),
    token = db.students.find((x) => x.id === s.id)!.token;
  await page.getByRole('button', { name: 'Open kiosk', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Scan your pouch.' })).toBeVisible();
  await page.getByRole('button', { name: 'Lock for shared use' }).click();
  await page.getByRole('button', { name: 'Enter pouch code' }).click();
  await page.getByLabel('Pouch code', { exact: true }).fill(token);
  await page.getByRole('button', { name: 'Submit pouch scan' }).click();
  await expect(page.getByRole('status')).toContainText('checked in');
  expect((await page.request.get('/api/state')).status()).toBe(401);
  await page.getByRole('button', { name: 'Ready for the next student' }).click();
  await page.getByLabel('Pouch code', { exact: true }).fill(token);
  await page.getByRole('button', { name: 'Submit pouch scan' }).click();
  await expect(page.getByRole('status')).toContainText('Scan already recorded');
  await page.waitForTimeout(31000); // Real server debounce interval.
  await page.getByLabel('Pouch code', { exact: true }).fill(token);
  await page.getByRole('button', { name: 'Submit pouch scan' }).click();
  await expect(page.getByRole('status')).toContainText('checked out');
  await page.getByRole('button', { name: 'Ready for the next student' }).click();
  await page.getByLabel('Pouch code', { exact: true }).fill('invalid-code');
  await page.getByRole('button', { name: 'Submit pouch scan' }).click();
  await expect(page.locator('.kiosk-error')).toContainText('not recognized');
});
test('assistant instruction access denied; legacy packet transitions still persist and are retained in history', async ({
  page,
}) => {
  await login(page, 'assistant');
  await expect(page.getByRole('button', { name: 'Reports', exact: true })).toHaveCount(0);
  const db = await state(page);
  expect(db.observations).toEqual([]);
  const denied = await page.request.post('/api/commands', {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      kind: 'observation',
      studentId: db.students[0].id,
      choices: ['Strong focus'],
      text: '',
      followUp: false,
    },
  });
  expect(denied.status()).toBe(403);
  expect((await page.request.get('/api/export')).status()).toBe(403);
  const description = 'Fictional retained packet ' + Date.now();
  expect(
    (
      await page.request.post('/api/commands', {
        headers: { Origin: new URL(page.url()).origin },
        data: { kind: 'homework', studentId: db.students[1].id, description },
      })
    ).ok(),
  ).toBe(true);
  const packet = (await state(page)).homework.find((h) => h.description === description)!;
  for (const status of ['prepared', 'handed-off'])
    expect(
      (
        await page.request.post('/api/commands', {
          headers: { Origin: new URL(page.url()).origin },
          data: { kind: 'homework-status', id: packet.id, status },
        })
      ).ok(),
    ).toBe(true);
  await page.reload();
  await openProfile(page, db.students[1].name);
  await page.getByRole('button', { name: 'Visit History', exact: true }).click();
  await page.getByText('Preserved V1/V2 worksheet and decision history', { exact: true }).click();
  await expect(page.locator('.historical-v3').filter({ hasText: description })).toContainText(
    'handed-off',
  );
});
test('camera-denial fallback, tablet/phone layout and modal Escape remain usable', async ({
  page,
}) => {
  await login(page);
  const box = await page.getByRole('button', { name: 'Sign out' }).boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  await page.screenshot({ path: 'test-results/v3-ipad.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Student Roster', exact: true }).click();
  await page.getByRole('button', { name: 'Add student', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/v3-phone-roster.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Open kiosk', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Scan your pouch.' })).toBeVisible();
  await page.getByRole('button', { name: 'Lock for shared use' }).click();
  await page.evaluate(() =>
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      configurable: true,
    }),
  );
  await page.getByRole('button', { name: 'Use camera' }).click();
  await expect(page.locator('.kiosk-error')).toContainText('Camera could not start');
  await expect(page.getByLabel('Pouch code', { exact: true })).toBeEnabled();
  await page.screenshot({ path: 'test-results/v3-phone-kiosk.png', fullPage: true });
});
test('anonymous access and foreign-origin writes remain denied', async ({ page }) => {
  expect((await page.request.get('/api/state')).status()).toBe(401);
  expect((await page.request.get('/api/export')).status()).toBe(401);
  await page.goto('/kiosk');
  await expect(page.getByRole('heading', { name: 'Let’s set up reception.' })).toBeVisible();
  const r = await page.request.post('/api/auth', {
    headers: { Origin: 'https://untrusted.example' },
    data: { email: 'owner@demo.center', password: 'CenterDemo!2026' },
  });
  expect(r.status()).toBe(403);
  await page.goto('/');
  await expect(page).toHaveURL(/login/);
});

for (const width of [1024, 390])
  test(
    'past session is read-only and observation edits retain history at ' + width,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await login(page, 'instructor');
      const s = await learner(page, width === 1024 ? 'Paper' : 'CONNECT'),
        v = await arrive(page, s.id);
      if (width === 1024) await prepare(page, s.id);
      await page.reload();
      await page.locator('[data-visit-id="' + v.id + '"]').click();
      let dialog = page.getByRole('dialog');
      await dialog.getByLabel('Instructional note').fill('Original fictional session note');
      await dialog.getByRole('button', { name: 'Focus: 3 out of 5', exact: true }).click();
      await dialog.getByRole('button', { name: 'Check in Math', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await physical(page, s.id, 'out');
      await page.reload();
      const before = await state(page);
      if (width < 600) await page.getByRole('button', { name: 'Open navigation' }).click();
      await openProfile(page, s.name);
      await page.getByRole('button', { name: 'Visit History', exact: true }).click();
      await page.getByRole('button', { name: 'View session', exact: true }).click();
      dialog = page.getByRole('dialog');
      await expect(dialog).toContainText('Past visit');
      await dialog.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished.catch(() => {})),
        );
      });
      if (width === 390) await expect(dialog).toContainText('Kumon CONNECT');
      else {
        // Packet groups align; individual chips may wrap within each group.
        const packets = dialog.locator('.history-packets');
        expect((await packets.first().boundingBox())!.x).toBe(
          (await packets.last().boundingBox())!.x,
        );
      }
      await expect(
        dialog.getByRole('button', { name: /Check in|Adjust|Repeat|Reset/ }),
      ).toHaveCount(0);
      await expect(dialog.locator('.history-skill-ratings')).toContainText('Focus');
      await expect(dialog.locator('.history-skill-ratings')).toContainText('3/5');
      await dialog.getByRole('button', { name: 'Edit observation', exact: true }).click();
      await dialog.getByRole('button', { name: 'Focus: 5 out of 5', exact: true }).click();
      await dialog
        .getByLabel('Instructional note', { exact: true })
        .fill('Amended fictional session note');
      await dialog.getByRole('button', { name: 'Reset', exact: true }).click();
      await expect(dialog.getByRole('group', { name: 'Focus rating' })).toHaveCount(0);
      await expect(dialog).toContainText('Original fictional session note');
      await expect(dialog).not.toContainText('Amended fictional session note');
      await dialog.getByRole('button', { name: 'Edit observation', exact: true }).click();
      await expect(
        dialog.getByRole('button', { name: 'Focus: 3 out of 5', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(dialog.getByLabel('Instructional note', { exact: true })).toHaveValue(
        'Original fictional session note',
      );
      await dialog.getByRole('button', { name: 'Focus: 5 out of 5', exact: true }).click();
      await dialog
        .getByLabel('Instructional note', { exact: true })
        .fill('Amended fictional session note');
      await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
      await page.screenshot({ path: 'test-results/session-observation-editor-' + width + '.png' });
      await dialog.getByRole('button', { name: 'Update observation', exact: true }).click();
      await expect(dialog.locator('.history-skill-ratings')).toContainText('5/5');
      await expect(dialog).toContainText('Amended fictional session note');
      await expect(
        dialog.getByRole('button', { name: 'Additional note', exact: true }),
      ).toHaveCount(0);
      await expect(dialog.getByText('Edit history', { exact: true })).toHaveCount(0);
      await expect(dialog).not.toContainText('Edited by');
      await expect(dialog.getByRole('group', { name: 'Focus rating' })).toHaveCount(0);
      await expect(dialog.getByRole('meter', { name: 'Focus', exact: true })).toHaveAttribute(
        'aria-valuenow',
        '5',
      );
      await expect(dialog.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0);
      await expect(dialog).not.toContainText('Fictional speech only');
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: 'test-results/session-history-' + width + '.png' });
      const after = await state(page);
      expect(after.visits).toEqual(before.visits);
      expect(after.operations!.assignments).toEqual(before.operations!.assignments);
      await dialog.getByRole('button', { name: 'Close panel' }).click();
      await page.reload();
      await page.getByRole('button', { name: 'Visit History', exact: true }).click();
      await page.getByRole('button', { name: 'View session', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Amended fictional session note');
    },
  );

test('visit history date lookup and duration sorting use recorded center-local visits', async ({
  page,
}) => {
  await login(page);
  const s = await learner(page, 'CONNECT');
  const snapshot = await state(page);
  snapshot.visits = snapshot.visits.filter((v) => v.studentId !== s.id);
  snapshot.visits.push(
    {
      id: 'history-long',
      studentId: s.id,
      arrivedAt: '2026-10-17T01:00:00Z',
      departedAt: '2026-10-17T02:00:00Z',
      departureVerified: true,
    },
    {
      id: 'history-short',
      studentId: s.id,
      arrivedAt: '2026-10-18T01:00:00Z',
      departedAt: '2026-10-18T01:15:00Z',
      departureVerified: true,
    },
    {
      id: 'history-unknown',
      studentId: s.id,
      arrivedAt: '2026-10-19T01:00:00Z',
      departedAt: null,
      closedAt: '2026-10-19T03:00:00Z',
      departureVerified: false,
    },
  );
  await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));
  await page.reload();
  await openProfile(page, s.name);
  await page.getByRole('button', { name: 'Visit History', exact: true }).click();
  const cards = page.locator('[data-history-visit]');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute('data-history-visit', 'history-unknown');
  await expect(page.getByText('Visit details', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Visit date', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Filter & sort' }).click();
  const dateControl = await page.getByLabel('Visit date', { exact: true }).boundingBox();
  const sortControl = await page.getByLabel('Sort visits').boundingBox();
  expect(dateControl!.y).toBe(sortControl!.y);
  const filterBox = (await page.locator('#visit-filters').boundingBox())!;
  const cardBox = (await cards.first().boundingBox())!;
  expect(filterBox.width).toBe(cardBox.width);
  await page.screenshot({ path: 'test-results/visit-history-filters.png' });
  await page.getByLabel('Visit date', { exact: true }).fill('2026-10-17');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('Saturday, October 17, 2026');
  await expect(cards).toContainText('15 minutes');
  await page.getByRole('button', { name: 'Clear date' }).click();
  await page.getByLabel('Sort visits').selectOption('longest');
  await expect(cards.first()).toHaveAttribute('data-history-visit', 'history-long');
  await expect(cards.last()).toHaveAttribute('data-history-visit', 'history-unknown');
  await page.getByLabel('Sort visits').selectOption('shortest');
  await expect(cards.first()).toHaveAttribute('data-history-visit', 'history-short');
  await expect(cards.last()).toContainText('Duration unverified');
  await page.getByLabel('Sort visits').selectOption('oldest');
  await expect(cards.first()).toHaveAttribute('data-history-visit', 'history-long');
  await page.getByRole('button', { name: 'Filter & sort' }).click();
  const normalCard = (await cards.first().boundingBox())!;
  const sessionButton = (await cards
    .first()
    .getByRole('button', { name: 'View session' })
    .boundingBox())!;
  expect(
    Math.abs(sessionButton.y + sessionButton.height / 2 - (normalCard.y + normalCard.height / 2)),
  ).toBeLessThan(2);
  await expect(page.getByLabel('Visit date', { exact: true })).not.toBeVisible();
  await expect(cards.first().locator('.visit-summary')).toContainText('ObservationsNo');
  await expect(cards.first().locator('.visit-summary')).toContainText('NoteNo');
  await page.screenshot({ path: 'test-results/visit-history-list.png' });
});
