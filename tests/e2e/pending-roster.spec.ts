import { test, expect } from '@playwright/test';
import { login, state } from './helpers';
import { emptyProductionCenter } from '../../src/lib/center-initialization';
import { applyRosterImport, prepareRosterImport } from '../../src/lib/roster/import';
import { applyV3, v3CommandInput } from '../../src/lib/v3-domain';
import { attendance } from '../../src/lib/domain';
import { fictionalPendingRoster } from '../fixtures/pending-roster';
import type { Snapshot } from '../../src/lib/model';

test('pending profile saves known names and grade, then enables Math without inventing Reading setup', async ({
  page,
}) => {
  await login(page);
  const session = await state(page),
    now = new Date();
  const db = emptyProductionCenter(
    {
      name: 'Fictional pending profile center',
      timezone: 'America/Los_Angeles',
      operatingDays: [1, 2, 3, 4],
      closingTime: '19:15',
      expectedMinutes: 45,
      earlyPerInstructor: 2,
    },
    'Fictional QA',
    now,
  );
  applyRosterImport(
    db,
    prepareRosterImport({ expectedRevision: 0, roster: fictionalPendingRoster() }, now),
    session.staff,
  );
  db.revision = session.revision + 1000;
  db.operations!.v3!.catalog.push({
    subject: 'Math',
    id: '4A',
    first: 1,
    last: 200,
    order: 0,
    approved: true,
    source: 'Fictional instructor-reviewed bounds',
  });
  const snapshot = (): Snapshot => ({
    ...structuredClone(db),
    staff: session.staff,
    timezone: 'America/Los_Angeles',
  });
  await page.route('**/api/state', (route) => route.fulfill({ json: snapshot() }));
  await page.route('**/api/commands', async (route) => {
    try {
      const body = route.request().postDataJSON();
      applyV3(db, v3CommandInput.parse(body.command), session.staff, now);
      db.revision++;
      await route.fulfill({ json: { ok: true } });
    } catch (error) {
      await route.fulfill({ status: 409, json: { error: (error as Error).message } });
    }
  });
  const student = db.students[0];
  await page.goto('/?view=students&student=' + student.id);
  const subjects = page.getByRole('region', { name: 'Subjects', exact: true });
  await expect(subjects).toContainText('Not set');
  await page.getByRole('button', { name: student.name, exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('First name', { exact: true }).fill('Fictional Updated');
  await dialog.getByLabel('Grade', { exact: true }).fill('1');
  await dialog.getByRole('button', { name: 'Mon', exact: true }).click();
  await dialog.getByRole('button', { name: 'Wed', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Fictional Updated Import Student', exact: true }),
  ).toBeVisible();
  expect(student.firstName).toBe('Fictional Updated');
  await subjects.getByRole('button', { name: 'Edit Math', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Learning mode', exact: true }).selectOption('Paper');
  await dialog.getByLabel('Current worksheet', { exact: true }).fill('21');
  await dialog.getByLabel('Worksheets per day', { exact: true }).fill('10');
  await dialog
    .getByRole('switch', { name: 'Enable homework for this subject', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(subjects).toContainText('PAPER');
  await subjects.getByRole('tab', { name: 'Reading', exact: true }).click();
  await expect(subjects).toContainText('Not set');
  expect(db.operations!.students[student.id].subjects.Reading.currentStart).toBe(0);
  await page.screenshot({ path: 'test-results/pending-roster-profile.png', fullPage: true });
});

test('a student with no selected subject can save visit observations without a homework handoff', async ({
  page,
}) => {
  await login(page);
  const session = await state(page),
    now = new Date();
  const db = emptyProductionCenter(
    {
      name: 'Fictional note-only center',
      timezone: 'America/Los_Angeles',
      operatingDays: [1, 2, 3, 4],
      closingTime: '19:15',
      expectedMinutes: 45,
      earlyPerInstructor: 2,
    },
    'Fictional QA',
    now,
  );
  const roster = fictionalPendingRoster();
  roster.profiles[0].subjects = [];
  applyRosterImport(db, prepareRosterImport({ expectedRevision: 0, roster }, now), session.staff);
  attendance(db, db.students[0].id, 'in', now, session.staff.name);
  db.revision = session.revision + 1000;
  await page.route('**/api/state', (route) =>
    route.fulfill({ json: { ...db, staff: session.staff, timezone: 'America/Los_Angeles' } }),
  );
  await page.route('**/api/commands', async (route) => {
    const body = route.request().postDataJSON();
    applyV3(db, v3CommandInput.parse(body.command), session.staff, now);
    db.revision++;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await page.locator('[data-visit-id="' + db.visits[0].id + '"]').click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Visit observations', { exact: true })
    .fill('Fictional note before subject setup.');
  await dialog.getByRole('button', { name: 'Save observations', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(db.observations[0].text).toBe('Fictional note before subject setup.');
  expect(db.visits[0].handoff).toBeUndefined();
});
