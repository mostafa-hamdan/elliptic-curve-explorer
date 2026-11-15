/**
 * Browser tests for the "Multiply" tab: the known class answers, the double-and-add
 * table, the special cases (k = 0, negative k, the point at infinity, oversized k) and
 * real 256-bit curves checked against a reference library.
 */
import { p256 } from '@noble/curves/nist.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import type { Page } from '@playwright/test';
import { choosePreset, expect, openExplorer, openTab, test } from './fixtures.ts';

/** Type k and press Calculate. */
async function multiplyBy(page: Page, k: string): Promise<void> {
  await page.getByLabel('k', { exact: true }).fill(k);
  await page.getByRole('button', { name: 'Calculate kP' }).click();
}

test.describe('multiply a point by a scalar', () => {
  test.beforeEach(async ({ page }) => {
    await openExplorer(page);
    await choosePreset(page, 'E17(2, 2)');
    await openTab(page, 'Multiply');
  });

  test('2P, 3P, 4P and 5P of (5, 1) on E17(2, 2) match the class values', async ({ page }) => {
    const expected: Record<string, string> = {
      '2': '(6, 3)',
      '3': '(10, 6)',
      '4': '(3, 1)',
      '5': '(9, 16)',
    };
    for (const [k, point] of Object.entries(expected)) {
      await multiplyBy(page, k);
      await expect(page.getByTestId('multiply-result')).toHaveText(point);
    }
  });

  test('shows the double-and-add table for 13P', async ({ page }) => {
    await multiplyBy(page, '13');
    await expect(page.getByTestId('multiply-bits')).toHaveText('13 = 11012');
    await expect(page.getByText('4 bits: 3 doublings and 2 additions')).toBeVisible();

    const rows = page.getByTestId('multiply-table').locator('tbody tr');
    await expect(rows).toHaveCount(4);
    // 13 = 1101₂: start, double+add (3P), double (6P), double+add (13P).
    await expect(rows.nth(0)).toContainText('Start: R = P');
    await expect(rows.nth(0)).toContainText('(5, 1)');
    await expect(rows.nth(1)).toContainText('Double, then add P');
    await expect(rows.nth(1)).toContainText('(10, 6)');
    await expect(rows.nth(1)).toContainText('3P');
    await expect(rows.nth(2)).toContainText('Double: R ← 2R');
    await expect(rows.nth(2)).toContainText('6P');
    await expect(rows.nth(3)).toContainText('13P');
    // 13P = −6P on a group of order 19; 6P = (16, 13), so 13P = (16, 4).
    await expect(page.getByTestId('multiply-result')).toHaveText('(16, 4)');
  });

  test('opens the working of a row and closes it again', async ({ page }) => {
    await multiplyBy(page, '5');
    await page.getByRole('button', { name: 'Show the working for step 2', exact: true }).click();
    const detail = page.getByTestId('multiply-row-detail');
    await expect(detail).toContainText('Doubling: 2R, with R = (5, 1)');
    // 2(5, 1): λ = (3·25 + 2)/(2·1) = 77/2 ≡ 9 · 2⁻¹ = 9 · 9 = 81 ≡ 13 (mod 17).
    await expect(detail).toContainText('λ = (3 · 5² + 2) / (2 · 1) = 77 / 2');
    await expect(detail).toContainText('2⁻¹ ≡ 9 (mod 17)');
    await expect(detail).toContainText('2R = (6, 3)');

    // Only one row is open at a time.
    await page.getByRole('button', { name: 'Show the working for step 3', exact: true }).click();
    await expect(page.getByTestId('multiply-row-detail')).toHaveCount(1);
    await expect(page.getByTestId('multiply-row-detail')).toContainText('Adding P: 2R + P');

    await page.getByRole('button', { name: 'Hide the working for step 3', exact: true }).click();
    await expect(page.getByTestId('multiply-row-detail')).toHaveCount(0);

    await page.getByRole('button', { name: 'Show the working for step 1', exact: true }).click();
    await expect(page.getByTestId('multiply-row-detail')).toContainText('starts as R = P');
  });

  test('19P = O, the order of the point', async ({ page }) => {
    await multiplyBy(page, '19');
    await expect(page.getByTestId('multiply-result')).toHaveText('O');
    await expect(page.getByTestId('multiply-table').locator('tbody tr')).toHaveCount(5);
  });

  test('k = 0 gives O with an explanation', async ({ page }) => {
    await multiplyBy(page, '0');
    await expect(page.getByTestId('multiply-result')).toHaveText('O');
    await expect(page.getByTestId('multiply-trivial')).toContainText('0 · P = O');
    await expect(page.getByTestId('multiply-table')).toHaveCount(0);
  });

  test('k times the point at infinity is O', async ({ page }) => {
    await page.getByTestId('mul-p-card').getByLabel('Point at infinity (O)').check();
    await multiplyBy(page, '7');
    await expect(page.getByTestId('multiply-result')).toHaveText('O');
    await expect(page.getByTestId('multiply-trivial')).toContainText('k · O = O');
  });

  test('a negative k multiplies the inverse point', async ({ page }) => {
    await multiplyBy(page, '-5');
    // 5P = (9, 16), so −5P = (9, 1).
    await expect(page.getByTestId('multiply-result')).toHaveText('(9, 1)');
    await expect(page.getByTestId('multiply-negated')).toContainText('−P = (5, 16)');
    await expect(page.getByTestId('multiply-result-section')).toContainText('(−5)P');
  });

  test('explains empty, non-numeric, decimal and oversized k', async ({ page }) => {
    await multiplyBy(page, '');
    await expect(page.getByTestId('multiply-problem')).toContainText('Enter a value for k.');

    await multiplyBy(page, 'five');
    await expect(page.getByTestId('multiply-problem')).toContainText('k must be a whole number');

    await multiplyBy(page, '2.5');
    await expect(page.getByTestId('multiply-problem')).toContainText('without a decimal point');

    // 2^1024 is one bit more than the limit; it has 309 digits.
    await multiplyBy(page, (2n ** 1024n).toString());
    await expect(page.getByTestId('multiply-problem')).toContainText(
      'k is too large: this app accepts scalars of up to 1024 bits',
    );
    await expect(page.getByTestId('multiply-result')).toHaveCount(0);

    // The largest allowed scalar still works. 2^18 ≡ 1 (mod 19) and 1024 = 18·56 + 16,
    // so 2^1024 − 1 ≡ 2^16 − 1 ≡ 5 − 1 = 4 (mod 19), and 4P = (3, 1).
    await multiplyBy(page, (2n ** 1024n - 1n).toString());
    await expect(page.getByTestId('multiply-result')).toHaveText('(3, 1)');
    await expect(page.getByTestId('multiply-table').locator('tbody tr')).toHaveCount(1024);
  });

  test('rejects a point that is not on the curve', async ({ page }) => {
    await page.getByLabel('y of P').fill('2');
    await expect(page.getByTestId('mul-p-status')).toContainText('Not on the curve');
    await multiplyBy(page, '3');
    await expect(page.getByTestId('multiply-problem')).toContainText('P is not on the curve');
  });

  test('marks the result as out of date when k changes', async ({ page }) => {
    await multiplyBy(page, '5');
    await expect(page.getByTestId('multiply-stale')).toHaveCount(0);
    await page.getByLabel('k', { exact: true }).fill('6');
    await expect(page.getByTestId('multiply-stale')).toBeVisible();
  });

  test('multiplies on secp256k1 and matches a reference library', async ({ page }) => {
    await choosePreset(page, 'secp256k1');
    const k = 0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba987654321n;
    await multiplyBy(page, k.toString());

    const expected = secp256k1.Point.BASE.multiply(k).toAffine();
    await expect(page.getByTestId('multiply-result')).toHaveText(`(${expected.x}, ${expected.y})`);
    await expect(page.getByTestId('multiply-table').locator('tbody tr')).toHaveCount(
      k.toString(2).length,
    );

    // The working of a 256-bit row opens too.
    await page.getByRole('button', { name: 'Show the working for step 2', exact: true }).click();
    await expect(page.getByTestId('multiply-row-detail')).toContainText('Result and check');
  });

  test('multiplies on NIST P-256 with a hexadecimal k', async ({ page }) => {
    await choosePreset(page, 'NIST P-256');
    await multiplyBy(page, '0xDEADBEEF');
    const expected = p256.Point.BASE.multiply(0xdeadbeefn).toAffine();
    await expect(page.getByTestId('multiply-result')).toHaveText(`(${expected.x}, ${expected.y})`);
  });

  test('the order of the base point times the base point is O on secp256k1', async ({ page }) => {
    await choosePreset(page, 'secp256k1');
    await multiplyBy(page, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    await expect(page.getByTestId('multiply-result')).toHaveText('O');
  });
});
