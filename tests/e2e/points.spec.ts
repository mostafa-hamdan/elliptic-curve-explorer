/**
 * Browser tests for the "All points" tab: the search, the count and Hasse check, the
 * table with its paging, choosing P and Q from the table, the plot modes and the
 * stated limit on p.
 */
import {
  choosePreset,
  expect,
  findAllPoints,
  openExplorer,
  openTab,
  setCurve,
  test,
} from './fixtures.ts';

test.describe('find all points', () => {
  test.beforeEach(async ({ page }) => {
    await openExplorer(page);
  });

  test('lists the 28 points of E23(1, 1) with the Hasse check', async ({ page }) => {
    await expect(page.getByTestId('points-idle')).toBeVisible();
    await findAllPoints(page);

    await expect(page.getByTestId('points-total')).toHaveText('28');
    await expect(page.getByTestId('points-hasse')).toHaveText('15 ≤ 28 ≤ 33');
    await expect(page.getByText('N is inside the bound')).toBeVisible();
    await expect(page.getByText('27 ordinary + O')).toBeVisible();

    // Row 1 is the point at infinity; the ordinary points follow in order of x, then y.
    const rows = page.getByTestId('points-table').locator('tbody tr');
    await expect(rows).toHaveCount(10);
    await expect(rows.nth(0)).toContainText('point at infinity');
    await expect(rows.nth(1).locator('td').nth(1)).toHaveText('0');
    await expect(rows.nth(1).locator('td').nth(2)).toHaveText('1');
    await expect(rows.nth(2).locator('td').nth(2)).toHaveText('22');
    await expect(page.getByTestId('points-range')).toHaveText('Rows 1–10 of 28');
    await expect(page.getByTestId('points-plot')).toHaveAttribute('data-mode', 'scatter');
  });

  test('pages through the table and changes the page size', async ({ page }) => {
    await findAllPoints(page);
    const rows = page.getByTestId('points-table').locator('tbody tr');

    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByTestId('points-range')).toHaveText('Rows 11–20 of 28');

    await page.getByRole('button', { name: 'Last page' }).click();
    await expect(page.getByTestId('points-range')).toHaveText('Rows 21–28 of 28');
    await expect(rows).toHaveCount(8);
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await page.getByRole('button', { name: 'First page' }).click();
    await expect(page.getByTestId('points-range')).toHaveText('Rows 1–10 of 28');

    await page.getByLabel('Rows per page').selectOption('50');
    await expect(rows).toHaveCount(28);
    await expect(page.getByTestId('points-range')).toHaveText('Rows 1–28 of 28');
  });

  test('a point chosen in the table becomes P or Q in the Add tab', async ({ page }) => {
    await findAllPoints(page);
    await page.getByRole('button', { name: 'Use (1, 7) as P' }).click();
    await page.getByRole('button', { name: 'Use (0, 22) as Q' }).click();
    await expect(page.getByTestId('selected-p')).toContainText('(1, 7)');
    await expect(page.getByTestId('selected-q')).toContainText('(0, 22)');
    await expect(page.getByRole('button', { name: 'Use (1, 7) as P' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await openTab(page, 'Add points');
    await expect(page.getByLabel('x of P')).toHaveValue('1');
    await expect(page.getByLabel('y of P')).toHaveValue('7');
    await expect(page.getByLabel('x of Q')).toHaveValue('0');
    await expect(page.getByLabel('y of Q')).toHaveValue('22');

    // The point at infinity can be chosen from the table too.
    await openTab(page, 'All points');
    await page.getByRole('button', { name: 'Use O as Q' }).click();
    await expect(page.getByTestId('selected-q')).toContainText('O');
  });

  test('counts 19 points on E17(2, 2) and 727 on E751(−1, 188)', async ({ page }) => {
    await choosePreset(page, 'E17(2, 2)');
    await findAllPoints(page);
    await expect(page.getByTestId('points-total')).toHaveText('19');

    await choosePreset(page, 'E751(−1, 188)');
    // Changing the curve throws the old list away.
    await expect(page.getByTestId('points-idle')).toBeVisible();
    await findAllPoints(page);
    await expect(page.getByTestId('points-total')).toHaveText('727');
    await expect(page.getByTestId('points-plot')).toHaveAttribute('data-mode', 'density');
    await expect(page.getByText('Density view.')).toBeVisible();
  });

  test('lists a curve at the top of the allowed range in a few seconds', async ({ page }) => {
    await setCurve(page, '199999', '2', '3');
    const started = Date.now();
    await findAllPoints(page);
    const seconds = (Date.now() - started) / 1000;
    expect(seconds, 'listing must finish within a few seconds').toBeLessThan(10);

    await expect(page.getByText('N is inside the bound')).toBeVisible();
    await expect(page.getByTestId('points-range')).toContainText('Rows 1–10 of');
    // The last page of a very long table still works.
    await page.getByRole('button', { name: 'Last page' }).click();
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  test('explains the limit instead of listing a curve that is too large', async ({ page }) => {
    await setCurve(page, '200003', '2', '3');
    await expect(page.getByTestId('points-limit')).toContainText('p ≤ 200,000');
    await expect(page.getByRole('button', { name: 'Find all points' })).toHaveCount(0);

    await choosePreset(page, 'secp256k1');
    await expect(page.getByTestId('points-limit')).toContainText(
      'Adding points and multiplying by a scalar still work',
    );
  });

  test('asks for a curve first when the curve is not valid', async ({ page }) => {
    await page.getByLabel('Prime p').fill('22');
    await expect(page.getByTestId('points-empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find all points' })).toHaveCount(0);
  });

  test('"Find again" repeats the search and keeps the result', async ({ page }) => {
    await findAllPoints(page);
    await page.getByRole('button', { name: 'Find again' }).click();
    await expect(page.getByTestId('points-total')).toHaveText('28');
  });
});
