/**
 * Browser tests for the pictures: the interactive points plot (hover, click to choose,
 * zoom, drag), the multiples animation, and the Learn page with the real-number view.
 */
import type { Page } from '@playwright/test';
import {
  choosePreset,
  expect,
  findAllPoints,
  openExplorer,
  openTab,
  setCurve,
  test,
} from './fixtures.ts';

/** Same margins as the plot component. */
const MARGIN = { left: 44, right: 12, top: 12 };

/**
 * Where a field point is drawn on the page, for a plot showing the whole field.
 *
 * @param page - the page.
 * @param p - the size of the field.
 * @param x - the point's x.
 * @param y - the point's y.
 */
async function plotPosition(page: Page, p: number, x: number, y: number) {
  // Mouse moves do not scroll the page, so bring the plot into the window first.
  await page.getByTestId('points-plot').scrollIntoViewIfNeeded();
  const box = (await page.getByTestId('points-plot').boundingBox())!;
  const side = box.width - MARGIN.left - MARGIN.right;
  return {
    x: box.x + MARGIN.left + ((x + 0.5) / p) * side,
    y: box.y + MARGIN.top + side - ((y + 0.5) / p) * side,
  };
}

test.describe('interactive points plot', () => {
  test.beforeEach(async ({ page }) => {
    await openExplorer(page);
    await findAllPoints(page);
  });

  test('hovering a dot shows its coordinates', async ({ page }) => {
    const spot = await plotPosition(page, 23, 1, 7);
    await page.mouse.move(spot.x, spot.y);
    await expect(page.getByTestId('plot-tooltip')).toContainText('(1, 7)');
    await expect(page.getByTestId('plot-tooltip')).toContainText('click: use as P');
    // Away from every dot the tooltip disappears.
    const empty = await plotPosition(page, 23, 2, 2);
    await page.mouse.move(empty.x, empty.y);
    await expect(page.getByTestId('plot-tooltip')).toHaveCount(0);
  });

  test('clicking a dot chooses it as P, or as Q after switching', async ({ page }) => {
    const first = await plotPosition(page, 23, 1, 7);
    await page.mouse.click(first.x, first.y);
    await expect(page.getByTestId('selected-p')).toContainText('(1, 7)');

    await page.getByTestId('plot-pick-target').getByText('Q', { exact: true }).click();
    const second = await plotPosition(page, 23, 0, 22);
    await page.mouse.click(second.x, second.y);
    await expect(page.getByTestId('selected-q')).toContainText('(0, 22)');

    await openTab(page, 'Add points');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('(17, 3)');
  });

  test('zooms in and out, drags the view, and goes back to the whole curve', async ({ page }) => {
    const plot = page.getByTestId('points-plot');
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(plot).toHaveAttribute('data-view', /^\d+,\d+,12$/);
    await expect(page.getByTestId('plot-range')).toBeVisible();

    const before = await plot.getAttribute('data-view');
    await plot.scrollIntoViewIfNeeded();
    const box = (await plot.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 120, { steps: 6 });
    await page.mouse.up();
    expect(await plot.getAttribute('data-view')).not.toBe(before);

    await page.getByRole('button', { name: 'Whole curve' }).click();
    await expect(plot).toHaveAttribute('data-view', '0,0,23');
    await expect(page.getByTestId('plot-range')).toHaveCount(0);
  });

  test('zooming into a large curve switches from density to single dots', async ({ page }) => {
    await setCurve(page, '1009', '2', '3');
    await findAllPoints(page);
    const plot = page.getByTestId('points-plot');
    await expect(plot).toHaveAttribute('data-mode', 'density');
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(plot).toHaveAttribute('data-mode', 'scatter');
  });
});

test.describe('multiples animation', () => {
  test('runs P, 2P, 3P … to O and reports the order', async ({ page }) => {
    await openExplorer(page);
    await choosePreset(page, 'E17(2, 2)');
    await openTab(page, 'Multiply');
    await page.getByRole('button', { name: 'Animate multiples of P' }).click();
    const dialog = page.getByTestId('multiples-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('multiples-current')).toHaveText('1P = (5, 1)');

    await dialog.getByRole('button', { name: 'Pause' }).click();
    await dialog.getByRole('button', { name: 'Next multiple' }).click();
    await expect(dialog.getByTestId('multiples-current')).toHaveText('2P = (6, 3)');

    await dialog.getByText('Fast', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Play' }).click();
    await expect(dialog.getByTestId('multiples-summary')).toContainText('P has order 19', {
      timeout: 10_000,
    });
    await expect(dialog.getByTestId('multiples-summary')).toContainText(
      'generates the whole group',
    );
    await expect(dialog.getByTestId('multiples-current')).toHaveText('19P = O');

    await dialog.getByRole('button', { name: 'Restart' }).click();
    await expect(dialog.getByTestId('multiples-current')).toHaveText(/^\dP = /);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('a point of order 5 on E97(2, 3) and Lagrange’s theorem', async ({ page }) => {
    await openExplorer(page);
    await choosePreset(page, 'E97(2, 3)');
    await openTab(page, 'Multiply');
    await page.getByLabel('x of P').fill('3');
    await page.getByLabel('y of P').fill('6');
    await page.getByRole('button', { name: 'Animate multiples of P' }).click();
    const dialog = page.getByTestId('multiples-dialog');
    await dialog.getByText('Fast', { exact: true }).click();
    await expect(dialog.getByTestId('multiples-summary')).toContainText('order 5', {
      timeout: 10_000,
    });
    await expect(dialog.getByTestId('multiples-summary')).toContainText('100 points');
  });

  test('is unavailable while P is not on the curve', async ({ page }) => {
    await openExplorer(page);
    await openTab(page, 'Multiply');
    await page.getByLabel('y of P').fill('11');
    await expect(page.getByRole('button', { name: 'Animate multiples of P' })).toBeDisabled();
  });
});

test.describe('Learn page', () => {
  test('shows the real-number picture and the mod p picture with engine numbers', async ({
    page,
  }) => {
    await page.goto('/learn');
    await expect(page).toHaveTitle('Learn · OnCurve');
    await expect(page.getByTestId('real-curve')).toBeVisible();
    await expect(page.getByTestId('mod-sum')).toHaveText('(17, 20)');

    // Choosing other points mod p updates the sum.
    await page.getByLabel('Q', { exact: true }).selectOption({ label: '(3, 10)' });
    await expect(page.getByTestId('mod-sum')).toHaveText('(7, 12)');

    // Doubling over the real numbers.
    const before = await page.getByTestId('real-sum').textContent();
    await page.getByTestId('real-curve').getByText('2P', { exact: true }).click();
    await expect(page.getByTestId('real-sum')).not.toHaveText(before ?? '');

    // The key exchange table agrees with itself: both sides get the same secret.
    const row = page.getByTestId('ecdh-example').locator('tbody tr').last();
    const cells = await row.locator('td').allTextContents();
    expect(cells[1]?.split('=').pop()?.trim()).toBe(cells[2]?.split('=').pop()?.trim());
  });
});
