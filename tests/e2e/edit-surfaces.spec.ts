import { test, expect, type Locator, type Page } from '@playwright/test';
import { login, state } from './helpers';
import { quickViewDemo } from '../fixtures/quick-view-demo';

async function capture(page: Page, dialog: Locator, name: string, suffix: string) {
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {})));
  });
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(12);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width - 12);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const geometry = await dialog.evaluate((el) => {
    const body = el.querySelector('.v3-modal-body')!;
    const rect = body.getBoundingClientRect();
    const css = getComputedStyle(body);
    const heading = el.querySelector(':scope > header h2')!.getBoundingClientRect();
    const footer = el.querySelector(':scope > footer');
    return {
      contentLeft: rect.left + parseFloat(css.paddingLeft),
      contentRight: rect.right - parseFloat(css.paddingRight),
      headingLeft: heading.left,
      actionRight: footer?.lastElementChild?.getBoundingClientRect().right,
      controls: [...body.querySelectorAll('input:not([type="file"]),select,textarea')].map(
        (input) => {
          const r = input.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
        },
      ),
    };
  });
  expect(geometry.headingLeft).toBeCloseTo(geometry.contentLeft, 0);
  if (geometry.actionRight) expect(geometry.actionRight).toBeCloseTo(geometry.contentRight, 0);
  for (const input of geometry.controls) {
    expect(input.left).toBeGreaterThanOrEqual(geometry.contentLeft - 1);
    expect(input.right).toBeLessThanOrEqual(geometry.contentRight + 1);
    expect(input.height).toBeGreaterThanOrEqual(44);
  }
  for (const [i, a] of geometry.controls.entries()) {
    for (const b of geometry.controls.slice(i + 1)) {
      const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect(overlapWidth > 1 && overlapHeight > 1, 'Form controls must not overlap').toBe(false);
    }
  }
  await page.screenshot({
    path: `test-results/edit-${name}-${suffix}.png`,
    animations: 'disabled',
  });
}

for (const [width, theme] of [
  [1024, 'dark'],
  [768, 'light'],
  [390, 'dark'],
  [320, 'light'],
] as const) {
  test(`editing surfaces align and cancel cleanly at ${width} in ${theme}`, async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.getByRole('button', { name: 'Theme', exact: true }).click();
    await page
      .getByRole('menuitemradio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
      .click();
    const session = await state(page),
      now = new Date('2026-10-19T21:00:00Z'),
      fixture = quickViewDemo(now);
    fixture.operations!.students[fixture.students[0].id].subjects.Reading.enrolled = false;
    await page.clock.install({ time: now });
    await page.route('**/api/state', (route) =>
      route.fulfill({
        json: {
          ...fixture,
          staff: session.staff,
          runtime: session.runtime,
          timezone: fixture.operations!.center.timezone,
        },
      }),
    );
    await page.route('**/api/account', (route) =>
      route.fulfill({
        json: {
          firstName: 'Fictional',
          lastName: 'Owner',
          email: 'owner@demo.center',
          picture: '',
          version: 0,
        },
      }),
    );
    let writes = 0;
    page.on('request', (r) => {
      if (
        ['POST', 'PATCH', 'DELETE'].includes(r.method()) &&
        /\/api\/(commands|account)$/.test(r.url())
      )
        writes++;
    });
    const suffix = `${width}-${theme}`;
    const dialog = (name: string) => page.getByRole('dialog', { name, exact: true });
    const inspect = async (title: string, name: string) =>
      capture(page, dialog(title), name, suffix);
    const cancel = async (title: string) => {
      await dialog(title).getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog(title)).toHaveCount(0);
    };

    await page.goto('/?view=students');
    await page.getByRole('button', { name: 'Add student', exact: true }).click();
    await inspect('Add fictional student', 'student-add');
    await cancel('Add fictional student');
    for (const view of ['students', 'homework']) {
      await page.goto('/?view=' + view);
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      await inspect('Filter students', 'filters-' + view);
      await page.keyboard.press('Escape');
      await expect(dialog('Filter students')).toHaveCount(0);
    }

    await page.goto('/?view=students&student=' + fixture.students[0].id);
    await page.getByRole('button', { name: 'Edit student information', exact: true }).click();
    await inspect('Edit student information', 'details');
    await dialog('Edit student information')
      .getByRole('tab', { name: 'Enrollment', exact: true })
      .click();
    await inspect('Edit student information', 'enrollment');
    await cancel('Edit student information');
    const subjects = page.getByRole('region', { name: 'Subjects', exact: true });
    await subjects.getByRole('button', { name: 'Edit Math', exact: true }).click();
    await inspect('Edit Math', 'math-paper');
    await dialog('Edit Math').getByLabel('Learning mode').selectOption('CONNECT');
    await inspect('Edit Math', 'math-connect');
    await cancel('Edit Math');
    await subjects.getByRole('button', { name: 'Add medal', exact: true }).click();
    const medal = subjects.locator('.profile-medal-fields');
    const medalSelect = (await medal.getByRole('combobox').boundingBox())!;
    const medalDate = (await medal.getByLabel('Award date', { exact: true }).boundingBox())!;
    expect(medalSelect.height).toBeCloseTo(medalDate.height, 0);
    if (width > 380) expect(medalSelect.y).toBeCloseTo(medalDate.y, 0);
    await subjects
      .getByRole('button', { name: 'Save medal', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/edit-medal-${suffix}.png`,
      animations: 'disabled',
    });
    await subjects.getByRole('button', { name: 'Cancel', exact: true }).click();
    const editBounds = (await subjects.locator('.profile-edit-action').boundingBox())!;
    await subjects.getByRole('tab', { name: 'Reading', exact: true }).click();
    const add = subjects.getByRole('button', { name: 'Add Reading', exact: true });
    await expect(subjects.getByRole('button', { name: 'Edit Reading', exact: true })).toHaveCount(
      0,
    );
    const addBounds = (await add.boundingBox())!;
    expect(addBounds.width).toBeCloseTo(editBounds.width, 0);
    expect(addBounds.x).toBeCloseTo(editBounds.x, 0);
    await add.click();
    await expect(
      dialog('Add Reading').getByRole('switch', { name: 'Enrolled', exact: true }),
    ).toBeChecked();
    await inspect('Add Reading', 'subject-add');
    await cancel('Add Reading');
    await expect(add).toBeFocused();

    await page.goto('/');
    const visit = fixture.visits.find(
      (v) => v.studentId === fixture.students[0].id && !v.departedAt && !v.closedAt,
    )!;
    await page.locator('[data-visit-id="' + visit.id + '"]').click();
    const quick = page.locator('.quick-view');
    await quick.getByRole('button', { name: '+ Add custom', exact: true }).click();
    await inspect('Add skill', 'custom-skill');
    await cancel('Add skill');
    await quick.getByRole('button', { name: 'Adjust', exact: true }).click();
    expect(await quick.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({
      path: `test-results/edit-adjust-${suffix}.png`,
      animations: 'disabled',
    });
    await quick.getByLabel('Adjustment reason', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/edit-adjust-bottom-${suffix}.png`,
      animations: 'disabled',
    });
    await quick.getByRole('button', { name: 'Repeat', exact: true }).click();
    expect(await quick.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({
      path: `test-results/edit-repeat-${suffix}.png`,
      animations: 'disabled',
    });
    await quick.getByLabel('Repeat reason', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/edit-repeat-bottom-${suffix}.png`,
      animations: 'disabled',
    });
    await quick.getByRole('button', { name: 'Close panel', exact: true }).click();

    await page.goto('/?view=students&student=' + fixture.students[0].id);
    await page.getByRole('button', { name: 'Visit History', exact: true }).click();
    const prior = fixture.visits.find(
      (v) => v.studentId === fixture.students[0].id && v.departedAt,
    )!;
    await page
      .locator('[data-history-visit="' + prior.id + '"]')
      .getByRole('button', { name: 'View session', exact: true })
      .click();
    await page
      .locator('.past-session')
      .getByText('Verify completed sheets', { exact: true })
      .click();
    expect(
      await page.locator('.past-session').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/edit-verification-${suffix}.png`,
      animations: 'disabled',
    });
    await page
      .locator('.past-session')
      .getByLabel('Verification note', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/edit-verification-bottom-${suffix}.png`,
      animations: 'disabled',
    });
    await page
      .locator('.past-session')
      .getByRole('button', { name: 'Close panel', exact: true })
      .click();
    await page.getByRole('button', { name: 'Filter & sort', exact: true }).click();
    const visitFilters = page.locator('.visit-filter-popover');
    await expect(visitFilters.getByLabel('Visit date')).toBeVisible();
    await visitFilters.locator('..').evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {})));
    });
    const dateField = (await visitFilters.getByLabel('Visit date').boundingBox())!;
    const sortField = (await visitFilters.getByLabel('Sort visits').boundingBox())!;
    expect(dateField.x).toBeCloseTo(sortField.x, 0);
    expect(dateField.width).toBeCloseTo(sortField.width, 0);
    await page.screenshot({
      path: `test-results/edit-visit-filters-${suffix}.png`,
      animations: 'disabled',
    });
    await visitFilters.getByRole('button', { name: 'Done', exact: true }).click();
    // Fictional read-only fixture for the retained historical reconciliation editor.
    prior.closedAt = prior.departedAt!;
    prior.departedAt = null;
    prior.departureVerified = false;
    await page.goto('/?view=students&student=' + fixture.students[0].id);
    await page.getByRole('button', { name: 'Visit History', exact: true }).click();
    const historicalVisit = page.locator('[data-history-visit="' + prior.id + '"]');
    await historicalVisit.getByText('Reconcile unverified departure', { exact: true }).click();
    await expect(historicalVisit.getByLabel('Actual departure (center time)')).toBeVisible();
    await historicalVisit
      .getByRole('button', { name: 'Verify actual departure', exact: true })
      .scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/edit-reconcile-${suffix}.png`,
      animations: 'disabled',
    });

    await page.goto('/?view=settings');
    const settings = dialog('Settings');
    await settings
      .locator('.setting-row')
      .filter({ hasText: 'Observation shortcuts' })
      .getByRole('button', { name: 'Change', exact: true })
      .click();
    await inspect('Observation shortcuts', 'shortcuts');
    await cancel('Observation shortcuts');
    await settings.getByRole('button', { name: 'Center details', exact: true }).click();
    await settings
      .locator('.setting-row')
      .filter({ hasText: 'Center name' })
      .getByRole('button', { name: 'Change', exact: true })
      .click();
    await inspect('Center details', 'center');
    await cancel('Center details');
    await settings.getByRole('button', { name: 'Manage', exact: true }).click();
    await inspect('Curriculum boundaries', 'curriculum');
    await cancel('Curriculum boundaries');
    await settings.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(settings.getByLabel('First name')).toHaveValue('Fictional');
    await page.screenshot({
      path: `test-results/edit-account-${suffix}.png`,
      animations: 'disabled',
    });
    await settings.getByRole('button', { name: 'Delete account', exact: true }).click();
    await inspect('Delete account', 'delete-explanation');
    await dialog('Delete account').getByRole('button', { name: 'Continue', exact: true }).click();
    await inspect('Delete account', 'delete-confirmation');
    await expect(
      dialog('Delete account').getByRole('button', { name: 'Delete my account', exact: true }),
    ).toBeDisabled();
    await cancel('Delete account');

    fixture.operations!.v3!.features = { homework: false, medals: true, version: 0 };
    await page.goto('/?view=settings');
    await settings.getByRole('switch', { name: 'Homework', exact: true }).click();
    await inspect('Turn on homework', 'homework-confirmation');
    await cancel('Turn on homework');
    expect(writes).toBe(0);
  });
}
