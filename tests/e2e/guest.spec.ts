/**
 * Browser tests for using OnCurve without an account: the landing page never forces a
 * sign-in, the guest banner can be closed for the session, and the Save button explains
 * that saving needs an account, then finishes the save after signing up or signing in,
 * back on the same screen.
 */
import { expect, openExplorer, openTab, test } from './fixtures.ts';

const PASSWORD = 'Chord-tangent-reflect-23';

/** A fresh email for each test, so tests never share an account. */
function newEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.describe('guests', () => {
  test('the landing page opens the Explorer without signing in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'OnCurve' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in / Create account' })).toBeVisible();
    await page.getByRole('link', { name: 'Open the explorer' }).first().click();
    await expect(page).toHaveURL(/\/explorer$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Elliptic Curve Explorer' }),
    ).toBeVisible();
    // Every calculation works as a guest.
    await openTab(page, 'Add points');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('(17, 20)');
  });

  test('the guest banner can be closed for the rest of the session', async ({ page, browser }) => {
    await page.goto('/');
    // The landing page explains accounts itself, so it shows no banner.
    await expect(page.getByTestId('guest-banner')).toHaveCount(0);
    await openExplorer(page);
    const banner = page.getByTestId('guest-banner');
    await expect(banner).toContainText('You are not signed in.');
    await expect(banner).toContainText('not saved');
    await expect(banner.getByRole('link', { name: 'Sign in to keep your work' })).toHaveAttribute(
      'href',
      '/signin',
    );

    await banner.getByRole('button', { name: 'Hide this message' }).click();
    await expect(banner).toHaveCount(0);
    await page.goto('/learn');
    await expect(page.getByTestId('guest-banner')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('guest-banner')).toHaveCount(0);

    // A new session (a fresh browser window) shows it again.
    const other = await browser.newContext();
    const second = await other.newPage();
    await second.addInitScript(() => window.localStorage.setItem('oncurve.tourDone', '1'));
    await second.goto('/explorer');
    await expect(second.getByTestId('guest-banner')).toBeVisible();
    await other.close();
  });

  test('Save as a guest, create an account, and the curve is saved on return', async ({ page }) => {
    await openExplorer(page);
    await page.getByLabel('Example curves').selectOption({ label: 'E17(2, 2)' });
    await page.getByRole('button', { name: 'Save curve' }).click();
    const dialog = page.getByTestId('guest-save-dialog');
    await expect(dialog).toContainText('Saving needs an account');
    await dialog.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByTestId('pending-save-hint')).toContainText('E17(2, 2)');
    const email = newEmail('guestsave');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Type the password again').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('I have saved my recovery codes somewhere safe.').check();
    await page.getByRole('button', { name: 'Continue and save your curve' }).click();

    // Back on the Explorer, with the same curve, and the save is done.
    await expect(page).toHaveURL(/\/explorer$/);
    await expect(page.getByLabel('Prime p')).toHaveValue('17');
    await expect(page.getByTestId('pending-save-notice')).toContainText(
      'Saved “E17(2, 2)” to My work',
    );
    await page
      .getByTestId('pending-save-notice')
      .getByRole('link', { name: 'Open My work' })
      .click();
    const saved = page.getByTestId('saved-list');
    await expect(saved).toContainText('E17(2, 2)');
    await expect(saved.locator('li')).toHaveCount(1);

    // Coming back to the Explorer does not save it a second time.
    await openExplorer(page);
    await expect(page.getByTestId('pending-save-notice')).toHaveCount(0);
    await page.getByTestId('account-button').click();
    await expect(page.getByTestId('saved-list').locator('li')).toHaveCount(1);
  });

  test('Save a point as a guest, sign in, and return to the same tab', async ({ page }) => {
    // An existing account, signed out again.
    const email = newEmail('guestpoint');
    await page.goto('/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Type the password again').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('I have saved my recovery codes somewhere safe.').check();
    await page.getByRole('button', { name: 'Continue to my account' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();

    await openExplorer(page);
    await openTab(page, 'Add points');
    await page.getByTestId('add-p-card').getByRole('button', { name: 'Save point' }).click();
    await page.getByTestId('guest-save-dialog').getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByTestId('pending-save-hint')).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page).toHaveURL(/\/explorer$/);
    await expect(page.getByRole('tab', { name: 'Add points' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('pending-save-notice')).toContainText('Saved');
    await page.getByTestId('account-button').click();
    await expect(page.getByTestId('saved-list')).toContainText('P = (3, 10)');
  });

  test('"Not now" parks nothing, so signing in goes to the account as usual', async ({ page }) => {
    await openExplorer(page);
    await page.getByRole('button', { name: 'Save curve' }).click();
    await page.getByTestId('guest-save-dialog').getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('guest-save-dialog')).toBeHidden();
    await page.goto('/signin');
    await expect(page.getByTestId('pending-save-hint')).toHaveCount(0);
  });
});
