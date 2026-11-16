/**
 * Browser tests for accounts: signing up (with the strength meter and recovery codes),
 * signing in and out, wrong passwords, two-factor authentication with a real TOTP code,
 * recovering a lost password, saving curves and points, the history with one-click
 * reload, the Security center, and deleting the account.
 */
import type { Page } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';
import { expect, openExplorer, openTab, test } from './fixtures.ts';

const PASSWORD = 'Chord-tangent-reflect-23';

/** A fresh email for each test, so tests never share an account. */
function newEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Create an account through the sign-up page and return its recovery codes. */
async function signUp(page: Page, email: string, password = PASSWORD): Promise<string[]> {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Type the password again').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('recovery-codes')).toBeVisible();
  const codes = await page.getByTestId('recovery-codes').locator('li').allTextContents();
  await page.getByLabel('I have saved my recovery codes somewhere safe.').check();
  await page.getByRole('button', { name: 'Continue to my account' }).click();
  await expect(page.getByTestId('account-email')).toContainText(email);
  return codes;
}

/** Sign in through the sign-in page (without a second factor). */
async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** The code an authenticator app would show now (or one step later). */
function totp(secret: string, offsetSeconds = 0): string {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({
    timestamp: Date.now() + offsetSeconds * 1000,
  });
}

test.describe('accounts', () => {
  test('sign up with the meter, see ten recovery codes, sign out and in again', async ({
    page,
  }) => {
    const email = newEmail('signup');
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: 'Create an account' }).click();

    // The meter refuses a weak password and the form explains why.
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('password1234');
    await expect(page.getByTestId('password-meter')).toContainText('Not accepted');
    await page.getByLabel('Type the password again').fill('password1234');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('signup-error')).toContainText('most common passwords');

    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await expect(page.getByTestId('password-meter')).toContainText(/Strong|Very strong/);
    await page.getByLabel('Type the password again').fill('something else entirely');
    await expect(page.getByText('The two passwords are not the same.').first()).toBeVisible();
    await page.getByLabel('Type the password again').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    const codes = page.getByTestId('recovery-codes').locator('li');
    await expect(codes).toHaveCount(10);
    await expect(page.getByRole('button', { name: 'Continue to my account' })).toBeDisabled();
    await page.getByLabel('I have saved my recovery codes somewhere safe.').check();
    await page.getByRole('button', { name: 'Continue to my account' }).click();
    await expect(page.getByTestId('account-email')).toContainText(email);
    await expect(page.getByTestId('account-button')).toBeVisible();

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

    await signIn(page, email);
    await expect(page.getByTestId('account-email')).toContainText(email);
  });

  test('a wrong password gets one plain message', async ({ page }) => {
    await signIn(page, newEmail('nobody'), 'Wrong-password-123');
    await expect(page.getByTestId('signin-error')).toHaveText('Wrong email or password.');
  });

  test('two-factor authentication with an authenticator code', async ({ page, browser }) => {
    const email = newEmail('twofactor');
    await signUp(page, email);
    await page.getByRole('tab', { name: 'Security' }).click();
    await page.getByRole('button', { name: 'Turn on two-factor authentication' }).click();
    await expect(page.getByTestId('totp-qr')).toBeVisible();
    const secret = (await page.getByTestId('totp-secret').textContent())!.trim();

    await page.getByLabel('2. Type the 6-digit code the app shows').fill('000000');
    await page.getByRole('button', { name: 'Confirm and turn on' }).click();
    await expect(page.getByTestId('twofactor-notice')).toContainText('not right');
    await page.getByLabel('2. Type the 6-digit code the app shows').fill(totp(secret));
    await page.getByRole('button', { name: 'Confirm and turn on' }).click();
    await expect(page.getByTestId('twofactor-notice')).toContainText(
      'Two-factor authentication is on',
    );

    // A second browser must now give the code as well.
    const other = await browser.newContext();
    const second = await other.newPage();
    await second.addInitScript(() => window.localStorage.setItem('oncurve.tourDone', '1'));
    await signIn(second, email);
    await expect(second.getByTestId('signin-code')).toBeVisible();
    await second.getByTestId('signin-code').fill(totp(secret, 30));
    await second.getByRole('button', { name: 'Check the code and sign in' }).click();
    await expect(second.getByTestId('account-email')).toContainText(email);

    // The first browser sees both sessions and the sign-ins in the activity list.
    await page.reload();
    await page.getByRole('tab', { name: 'Security' }).click();
    await expect(page.getByTestId('sessions-list').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('activity-list')).toContainText(
      'Two-factor authentication turned on',
    );
    await other.close();
  });

  test('a recovery code resets a lost password', async ({ page }) => {
    const email = newEmail('recover');
    const codes = await signUp(page, email);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();

    await page.goto('/recover');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Recovery code').fill('AAAAA-BBBBB');
    await page.getByLabel('New password').fill('A-completely-new-secret-77');
    await page.getByRole('button', { name: 'Set the new password' }).click();
    await expect(page.getByTestId('recover-error')).toHaveText(
      'That email and recovery code do not match.',
    );

    await page.getByLabel('Recovery code').fill(codes[0]!);
    await page.getByRole('button', { name: 'Set the new password' }).click();
    await expect(page.getByText('Your password was reset')).toBeVisible();

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, email, 'A-completely-new-secret-77');
    await expect(page.getByTestId('account-email')).toContainText(email);
  });

  test('saves a curve and a point, records history, and loads them back', async ({ page }) => {
    await signUp(page, newEmail('work'));
    await openExplorer(page);

    await page.getByRole('button', { name: 'Save curve' }).click();
    const dialog = page.getByTestId('save-dialog');
    await expect(dialog.getByLabel('Name')).toHaveValue('E23(1, 1)');
    await dialog.getByLabel('Name').fill('<b>My classroom curve</b>');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

    await openTab(page, 'Add points');
    await page.getByTestId('add-p-card').getByRole('button', { name: 'Save point' }).click();
    await page.getByTestId('save-dialog').getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await openTab(page, 'Multiply');
    await page.getByRole('button', { name: 'Calculate kP' }).click();

    await page.getByTestId('account-button').click();
    const saved = page.getByTestId('saved-list');
    // The name is shown exactly as typed: as text, not as markup.
    await expect(saved).toContainText('<b>My classroom curve</b>');
    await expect(saved).toContainText('P = (3, 10)');
    const history = page.getByTestId('history-list');
    await expect(history.locator('li')).toHaveCount(2);
    await expect(history.locator('li').first()).toContainText('(7, 12)');
    await expect(history.locator('li').nth(1)).toContainText('(17, 20)');

    // Change the curve, then load the addition back from the history.
    await page.goto('/');
    await page.getByLabel('Example curves').selectOption({ label: 'E17(2, 2)' });
    await page.getByTestId('account-button').click();
    await history.locator('li').nth(1).getByRole('button', { name: 'Open' }).click();
    await expect(page.getByLabel('Prime p')).toHaveValue('23');
    await expect(page.getByRole('tab', { name: 'Add points' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('x of Q')).toHaveValue('9');

    // Delete a saved item and clear the history.
    await page.getByTestId('account-button').click();
    await saved.getByRole('button', { name: 'Delete <b>My classroom curve</b>' }).click();
    await expect(saved).not.toContainText('My classroom curve');
    await page.getByRole('button', { name: 'Clear history' }).click();
    await page.getByRole('button', { name: 'Yes, clear it' }).click();
    await expect(history).toContainText('Every calculation you make while signed in appears here.');
  });

  test('guests see no save buttons and are sent to sign in from the account page', async ({
    page,
  }) => {
    await openExplorer(page);
    await expect(page.getByRole('button', { name: 'Save curve' })).toHaveCount(0);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/signin$/);
  });

  test('changes the password and deletes the account', async ({ page }) => {
    const email = newEmail('delete');
    await signUp(page, email);
    await page.getByRole('tab', { name: 'Security' }).click();

    const form = page.getByTestId('password-form');
    await form.getByLabel('Current password').fill('not-my-password-at-all');
    await form.getByLabel('New password').fill('Another-strong-secret-55');
    await form.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByTestId('password-notice')).toContainText(
      'current password is not right',
    );
    await form.getByLabel('Current password').fill(PASSWORD);
    await form.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByTestId('password-notice')).toContainText('Password changed');

    const remove = page.getByTestId('delete-form');
    await remove.getByLabel('Password', { exact: true }).fill('Another-strong-secret-55');
    await remove.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByTestId('delete-notice')).toContainText('Tick the box');
    await remove
      .getByLabel('I understand that everything in this account will be deleted for good.')
      .check();
    await remove.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

    await signIn(page, email, 'Another-strong-secret-55');
    await expect(page.getByTestId('signin-error')).toHaveText('Wrong email or password.');
  });

  test('the Security page explains every protection', async ({ page }) => {
    await page.goto('/security');
    await expect(page).toHaveTitle('Security · OnCurve');
    await expect(page.getByTestId('protections').locator('li')).toHaveCount(9);
    await expect(page.getByText(/Argon2id/)).toBeVisible();
  });
});
