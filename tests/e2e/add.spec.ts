/**
 * Browser tests for the "Add points" tab: the known class answers with their steps,
 * every special case of the addition law, and every kind of bad input.
 */
import { p256 } from '@noble/curves/nist.js';
import {
  choosePreset,
  expect,
  findAllPoints,
  openExplorer,
  openTab,
  setPoint,
  test,
} from './fixtures.ts';

test.describe('add two points', () => {
  test.beforeEach(async ({ page }) => {
    await openExplorer(page);
    await openTab(page, 'Add points');
  });

  test('(3, 10) + (9, 7) = (17, 20) on E23(1, 1), with the hand-method steps', async ({ page }) => {
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('(17, 20)');

    const section = page.getByTestId('add-result-section');
    await expect(section).toContainText('Chord rule');
    await expect(section).toContainText('λ = (7 − 10) / (9 − 3) = (−3) / 6');
    await expect(section).toContainText('Reduce mod 23: −3 ≡ 20 and 6 ≡ 6');
    // Extended Euclid for 6⁻¹ mod 23.
    await expect(section).toContainText('23 = 3 · 6 + 5');
    await expect(section).toContainText('6 = 1 · 5 + 1');
    await expect(section).toContainText('6⁻¹ ≡ 4 (mod 23)');
    await expect(section).toContainText('Check: 6 · 4 = 24 ≡ 1 (mod 23)');
    await expect(section).toContainText('λ ≡ 20 · 4 = 80 ≡ 11 (mod 23)');
    await expect(section).toContainText('x₃ = 11² − 3 − 9 = 109 ≡ 17 (mod 23)');
    await expect(section).toContainText('y₃ = 11 · (3 − 17) − 10 = −164 ≡ 20 (mod 23)');
    await expect(section).toContainText('R = (17, 20)');
  });

  test('2(3, 10) = (7, 12) with the tangent rule', async ({ page }) => {
    await page.getByRole('button', { name: 'Double P (2P)' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('(7, 12)');

    const section = page.getByTestId('add-result-section');
    await expect(section).toContainText('Tangent rule (doubling)');
    await expect(section).toContainText('2P = (7, 12)');
    await expect(section).toContainText('λ = (3 · 3² + 1) / (2 · 10) = 28 / 20');
    await expect(section).toContainText('20⁻¹ ≡ 15 (mod 23)');
    await expect(section).toContainText('λ ≡ 5 · 15 = 75 ≡ 6 (mod 23)');
    // The Q boxes now show the same point, matching what was computed.
    await expect(page.getByLabel('x of Q')).toHaveValue('3');
    await expect(page.getByLabel('y of Q')).toHaveValue('10');
  });

  test('Double P never marks its own result as out of date', async ({ page }) => {
    // Straight after an earlier P + Q, with a Q different from P.
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await page.getByRole('button', { name: 'Double P (2P)' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('(7, 12)');
    await expect(page.getByTestId('add-stale')).toHaveCount(0);

    // With P typed outside 0 … p − 1, so the boxes and the computed point differ in text.
    await setPoint(page, 'P', '26', '-13');
    await page.getByRole('button', { name: 'Double P (2P)' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('(7, 12)');
    await expect(page.getByTestId('add-stale')).toHaveCount(0);

    // With P = O.
    await page.getByTestId('add-p-card').getByLabel('Point at infinity (O)').check();
    await page.getByRole('button', { name: 'Double P (2P)' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('O');
    await expect(page.getByTestId('add-stale')).toHaveCount(0);

    // Editing Q afterwards does make it out of date, as it should.
    await page.getByTestId('add-q-card').getByLabel('Point at infinity (O)').uncheck();
    await setPoint(page, 'Q', '0', '1');
    await expect(page.getByTestId('add-stale')).toBeVisible();
  });

  test('pressing Enter in a box calculates', async ({ page }) => {
    await page.getByLabel('y of Q').press('Enter');
    await expect(page.getByTestId('add-result')).toHaveText('(17, 20)');
  });

  test('P + (−P) = O', async ({ page }) => {
    await page.getByRole('button', { name: 'Set Q = −P' }).click();
    await expect(page.getByLabel('x of Q')).toHaveValue('3');
    await expect(page.getByLabel('y of Q')).toHaveValue('13');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();

    await expect(page.getByTestId('add-result')).toHaveText('O');
    const section = page.getByTestId('add-result-section');
    await expect(section).toContainText('Inverse points');
    await expect(section).toContainText('y₁ + y₂ = 10 + 13 = 23 ≡ 0 (mod 23)');
    await expect(section).toContainText('the identity element of the group');
  });

  test('O is the identity: P + O = P and O + Q = Q', async ({ page }) => {
    await page.getByTestId('add-q-card').getByLabel('Point at infinity (O)').check();
    await expect(page.getByLabel('x of Q')).toBeDisabled();
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('(3, 10)');
    await expect(page.getByTestId('add-result-section')).toContainText(
      'Q is the point at infinity',
    );

    await page.getByRole('button', { name: 'Swap P and Q' }).click();
    await expect(page.getByTestId('add-p-card').getByLabel('Point at infinity (O)')).toBeChecked();
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('(3, 10)');
    await expect(page.getByTestId('add-result-section')).toContainText(
      'P is the point at infinity',
    );

    // O + O = O.
    await page.getByTestId('add-q-card').getByLabel('Point at infinity (O)').check();
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('O');
  });

  test('doubling a point with y = 0 gives O', async ({ page }) => {
    // On E23(1, 0), the point (0, 0) has y = 0.
    await page.getByLabel('Coefficient b').fill('0');
    await setPoint(page, 'P', '0', '0');
    await page.getByRole('button', { name: 'Double P (2P)' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('O');
    await expect(page.getByTestId('add-result-section')).toContainText('Vertical tangent');
    await expect(page.getByTestId('add-result-section')).toContainText('it has order 2');
  });

  test('rejects a point that is not on the curve and shows both sides', async ({ page }) => {
    await setPoint(page, 'P', '3', '11');
    await expect(page.getByTestId('add-p-status')).toHaveText(
      'Not on the curve: y² ≡ 6 but x³ + ax + b ≡ 8 (mod p).',
    );
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-problem')).toContainText('P is not on the curve');
    await expect(page.getByTestId('add-result')).toHaveCount(0);

    // Fixing the point removes the message straight away.
    await page.getByLabel('y of P').fill('10');
    await expect(page.getByTestId('add-problem')).toHaveCount(0);
    await expect(page.getByTestId('add-p-status')).toContainText('On the curve: y² ≡ 8');
  });

  test('explains empty and non-numeric coordinates', async ({ page }) => {
    await setPoint(page, 'Q', '', '');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-problem')).toContainText('Enter both coordinates of Q');
    await expect(page.getByText('Enter a value for x of Q.')).toBeVisible();
    await expect(page.getByText('Enter a value for y of Q.')).toBeVisible();

    await setPoint(page, 'Q', 'nine', '7');
    await expect(page.getByText(/x of Q must be a whole number: digits only/)).toBeVisible();
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-problem')).toContainText(
      'Point Q has a coordinate that is not a whole number.',
    );
  });

  test('reduces coordinates outside 0 … p − 1', async ({ page }) => {
    await setPoint(page, 'P', '26', '-13');
    await expect(page.getByTestId('add-p-status')).toContainText('Reduced mod p to (3, 10).');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('(17, 20)');
  });

  test('says so when the curve is not valid', async ({ page }) => {
    await page.getByLabel('Prime p').fill('24');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-problem')).toContainText('Set up a valid curve');
  });

  test('marks the result as out of date when an input changes, and clears it with the curve', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-stale')).toHaveCount(0);

    await setPoint(page, 'Q', '0', '1');
    await expect(page.getByTestId('add-stale')).toBeVisible();
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-stale')).toHaveCount(0);

    // A result belongs to its curve: changing the curve removes it.
    await page.getByLabel('Coefficient b').fill('4');
    await expect(page.getByTestId('add-result')).toHaveCount(0);
  });

  test('picks points from the list of all points', async ({ page }) => {
    await page
      .getByTestId('add-p-card')
      .getByRole('button', { name: /Load the points/ })
      .click();
    const pickP = page.getByLabel('Or pick P from the list of points');
    await expect(pickP).toBeVisible();
    // The menu shows the point that is already typed.
    await expect(pickP.locator('option:checked')).toHaveText('(3, 10)');

    await pickP.selectOption({ label: '(1, 7)' });
    await expect(page.getByLabel('x of P')).toHaveValue('1');
    await expect(page.getByLabel('y of P')).toHaveValue('7');

    await page.getByLabel('Or pick Q from the list of points').selectOption({ label: '(0, 22)' });
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    // Verified by hand: λ = 15/(−1) ≡ 8, x₃ = 64 − 1 − 0 = 63 ≡ 17, y₃ = 8(1 − 17) − 7 ≡ 3.
    await expect(page.getByTestId('add-result')).toHaveText('(17, 3)');
  });

  test('keeps the inputs and the result when switching tabs', async ({ page }) => {
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await openTab(page, 'All points');
    await findAllPoints(page);
    await openTab(page, 'Add points');
    await expect(page.getByTestId('add-result')).toHaveText('(17, 20)');
  });

  test('adds two points on the 256-bit curve P-256 and matches a reference library', async ({
    page,
  }) => {
    await choosePreset(page, 'NIST P-256');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();

    // The preset has P = G and Q = 2G, so the sum must be 3G.
    const expected = p256.Point.BASE.multiply(3n).toAffine();
    await expect(page.getByTestId('add-result')).toHaveText(`(${expected.x}, ${expected.y})`);
    // The long Euclid table starts folded and can be opened.
    const table = page.getByText(/Show all \d+ division lines/);
    await expect(table).toBeVisible();
    await table.click();
    await expect(page.getByTestId('add-result-section').locator('table')).toBeVisible();
  });
});
