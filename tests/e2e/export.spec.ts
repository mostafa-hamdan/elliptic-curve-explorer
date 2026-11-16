/**
 * Browser tests for exporting: CSV downloads from each tab, the plot as a PNG picture,
 * and the printable report with every result calculated so far.
 */
import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';
import { choosePreset, expect, findAllPoints, openExplorer, openTab, test } from './fixtures.ts';

/** Click a button that starts a download and return the downloaded file. */
async function download(page: Page, name: string): Promise<{ download: Download; text: string }> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name }).click(),
  ]);
  const path = await file.path();
  return { download: file, text: await readFile(path, 'utf8') };
}

test.describe('export', () => {
  test('downloads the points as CSV and the plot as PNG', async ({ page }) => {
    await openExplorer(page);
    await findAllPoints(page);
    const csv = await download(page, 'Download points (CSV)');
    expect(csv.download.suggestedFilename()).toBe('oncurve-E23-1-1-points.csv');
    expect(csv.text).toContain('1,,,point at infinity O');
    expect(csv.text.trimEnd().split('\r\n')).toHaveLength(29);

    const [png] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'PNG' }).click(),
    ]);
    expect(png.suggestedFilename()).toBe('oncurve-E23-1-1-plot.png');
    const bytes = await readFile(await png.path());
    // Every PNG file starts with the same eight bytes.
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  test('downloads the addition steps and the double-and-add table', async ({ page }) => {
    await openExplorer(page);
    await openTab(page, 'Add points');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    const steps = await download(page, 'Download steps (CSV)');
    expect(steps.text).toContain('result,"(17, 20)"');

    await choosePreset(page, 'E17(2, 2)');
    await openTab(page, 'Multiply');
    await page.getByLabel('k', { exact: true }).fill('13');
    await page.getByRole('button', { name: 'Calculate kP' }).click();
    const table = await download(page, 'Download table (CSV)');
    expect(table.download.suggestedFilename()).toBe('oncurve-E17-2-2-multiply.csv');
    expect(table.text).toContain('4,1,double-add,13P,16,4');
  });

  test('the printable report shows every result and is ready to print', async ({ page }) => {
    await openExplorer(page);
    // Moving within the app keeps the work; reloading would start afresh.
    await page.getByRole('link', { name: 'What this app cannot do' }).click();
    await page.evaluate(() => {
      window.history.pushState({}, '', '/report');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByTestId('report-empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeDisabled();

    await page.getByRole('link', { name: 'Back to the Explorer' }).click();
    await findAllPoints(page);
    await openTab(page, 'Add points');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await openTab(page, 'Multiply');
    await page.getByRole('button', { name: 'Calculate kP' }).click();
    await page
      .getByTestId('multiply-export')
      .getByRole('button', { name: 'Printable report' })
      .click();

    const report = page.getByTestId('report');
    await expect(page).toHaveTitle('Report · OnCurve');
    await expect(report).toContainText('N = 28 points');
    await expect(page.getByTestId('report-points-list')).toContainText('O, (0, 1), (0, 22)');
    await expect(page.getByTestId('report-add-result')).toHaveText('(17, 20)');
    await expect(report).toContainText('6⁻¹ ≡ 4 (mod 23)');
    await expect(page.getByTestId('report-multiply-result')).toHaveText('(7, 12)');
    await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeEnabled();

    // On paper the top bar, the footer and the buttons are hidden.
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('header')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeHidden();
  });
});
