/**
 * Browser tests for the curve setup panel: live validation of p, a and b, reduction
 * mod p, singular curves, the example curves and Clear all.
 */
import { choosePreset, expect, openExplorer, setCurve, test } from './fixtures.ts';

test.describe('curve setup', () => {
  test.beforeEach(async ({ page }) => {
    await openExplorer(page);
  });

  test('opens on the classroom curve E23(1, 1), already valid', async ({ page }) => {
    await expect(page.getByLabel('Prime p')).toHaveValue('23');
    await expect(page.getByTestId('curve-status')).toContainText('E23(1, 1) is a valid curve');
    await expect(page.getByTestId('curve-status')).toContainText('y² ≡ x³ + x + 1 (mod 23)');
    await expect(page.getByTestId('curve-status')).toContainText('4a³ + 27b² ≡ 8 (mod p)');
    await expect(page.getByText('Prime, 5 bits')).toBeVisible();
  });

  test('rejects a p that is not prime and shows a factor', async ({ page }) => {
    await page.getByLabel('Prime p').fill('21');
    await expect(page.getByText('p must be prime, but 21 is not (21 = 3 × 7).')).toBeVisible();
    await expect(page.getByLabel('Prime p')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('curve-status')).toContainText('Not a valid curve yet');
  });

  test('rejects p = 2, p = 3, zero and negative values', async ({ page }) => {
    for (const value of ['2', '3']) {
      await page.getByLabel('Prime p').fill(value);
      await expect(page.getByText(/p must be a prime greater than 3/)).toBeVisible();
    }
    for (const value of ['0', '1', '-7']) {
      await page.getByLabel('Prime p').fill(value);
      await expect(page.getByText(/p must be a prime number greater than 3/)).toBeVisible();
    }
  });

  test('rejects text that is not a whole number, in every box', async ({ page }) => {
    await page.getByLabel('Prime p').fill('abc');
    await expect(page.getByText(/p must be a whole number: digits only/)).toBeVisible();

    await page.getByLabel('Prime p').fill('23');
    await page.getByLabel('Coefficient a').fill('1.5');
    await expect(
      page.getByText('a must be a whole number, without a decimal point.'),
    ).toBeVisible();

    await page.getByLabel('Coefficient a').fill('1');
    await page.getByLabel('Coefficient b').fill('<script>alert(1)</script>');
    await expect(page.getByText(/b must be a whole number: digits only/)).toBeVisible();
    await expect(page.getByTestId('curve-status')).toContainText('Not a valid curve yet');
  });

  test('asks for the values when the boxes are empty, without showing errors', async ({ page }) => {
    await setCurve(page, '', '', '');
    await expect(page.getByTestId('curve-status')).toContainText('Define a curve');
    await expect(page.getByLabel('Prime p')).toHaveAttribute('aria-invalid', 'false');
  });

  test('rejects singular curves', async ({ page }) => {
    await setCurve(page, '23', '0', '0');
    await expect(page.getByTestId('curve-status')).toContainText('This curve is singular');
    // a = −3, b = 2 gives 4·(−27) + 27·4 = 0 for every p.
    await setCurve(page, '97', '-3', '2');
    await expect(page.getByTestId('curve-status')).toContainText('This curve is singular');
  });

  test('reduces a and b mod p and shows the reduced values', async ({ page }) => {
    await setCurve(page, '23', '24', '-22');
    await expect(page.getByText('a ≡ 1 (mod p)')).toBeVisible();
    await expect(page.getByText('b ≡ 1 (mod p)')).toBeVisible();
    await expect(page.getByTestId('curve-status')).toContainText('E23(1, 1) is a valid curve');
  });

  test('accepts hexadecimal input', async ({ page }) => {
    await setCurve(page, '0x17', '0x1', '0x1');
    await expect(page.getByTestId('curve-status')).toContainText('E23(1, 1) is a valid curve');
  });

  test('loads each example curve as a valid curve', async ({ page }) => {
    const labels = await page.getByLabel('Example curves').locator('option').allTextContents();
    const presets = labels.filter((label) => label !== 'Custom curve');
    expect(presets.length).toBeGreaterThanOrEqual(7);
    for (const label of presets) {
      await choosePreset(page, label);
      await expect(page.getByTestId('curve-status')).toContainText('is a valid curve');
      await expect(page.getByTestId('preset-note')).toBeVisible();
    }
  });

  test('describes a 256-bit curve without overflowing', async ({ page }) => {
    await choosePreset(page, 'secp256k1');
    await expect(page.getByText('Prime, 256 bits')).toBeVisible();
    await expect(page.getByTestId('curve-status')).toContainText(
      'This 256-bit curve is a valid curve',
    );
  });

  test('editing a box switches the menu back to "Custom curve"', async ({ page }) => {
    await expect(page.getByLabel('Example curves')).toHaveValue('e23-1-1');
    await page.getByLabel('Coefficient b').fill('4');
    await expect(page.getByLabel('Example curves')).toHaveValue('');
    await expect(page.getByTestId('preset-note')).toHaveCount(0);
  });

  test('Clear all empties every box', async ({ page }) => {
    await page.getByRole('button', { name: 'Clear all' }).click();
    for (const label of ['Prime p', 'Coefficient a', 'Coefficient b']) {
      await expect(page.getByLabel(label)).toHaveValue('');
    }
    await expect(page.getByTestId('curve-status')).toContainText('Define a curve');
    await expect(page.getByTestId('points-empty')).toBeVisible();
  });

  test('refuses an absurdly long number with a clear message', async ({ page }) => {
    await page.getByLabel('Prime p').fill('9'.repeat(401));
    await expect(
      page.getByText('p is too long: at most 400 characters are accepted.'),
    ).toBeVisible();
    await page.getByLabel('Prime p').fill('9'.repeat(350));
    await expect(
      page.getByText(/p is too large: this app accepts primes of up to 1024 bits/),
    ).toBeVisible();
  });
});
