/**
 * The "picky professor" pass: strange and hostile input on every screen. Each case must
 * end in a clear message or a correct result, never a crash, a wrong number or a console
 * error (the console guard in fixtures.ts fails the test on any error or warning).
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

test.describe('hostile input', () => {
  test('odd characters in the curve boxes', async ({ page }) => {
    await openExplorer(page);
    const cases: Array<[string, RegExp]> = [
      ['２３', /p must be a whole number/], // full-width digits
      ['23🙂', /p must be a whole number/],
      ['٢٣', /p must be a whole number/], // Arabic-Indic digits
      ['1e3', /p must be a whole number/],
      ['0x', /p must be a whole number/],
      ['--23', /p must be a whole number/],
      ['23.0', /without a decimal point/],
      ['=SUM(A1)', /p must be a whole number/],
    ];
    for (const [text, message] of cases) {
      await page.getByLabel('Prime p').fill(text);
      await expect(page.getByText(message).first(), text).toBeVisible();
      await expect(page.getByTestId('curve-status')).toContainText('Not a valid curve yet');
    }
    // Digit separators and surrounding spaces are fine.
    await page.getByLabel('Prime p').fill(' 2_3 ');
    await expect(page.getByTestId('curve-status')).toContainText('E23(1, 1) is a valid curve');
  });

  test('the smallest curves (p = 5) and a negative a that reduces', async ({ page }) => {
    await openExplorer(page);
    await setCurve(page, '5', '-1', '1');
    await expect(page.getByText('a ≡ 4 (mod p)')).toBeVisible();
    await findAllPoints(page);
    await expect(page.getByText('N is inside the bound')).toBeVisible();
    // Every point of this tiny curve is listed and the plot draws dots.
    await expect(page.getByTestId('points-plot')).toHaveAttribute('data-mode', 'scatter');
  });

  test('changing the curve while points are being found never shows the old list', async ({
    page,
  }) => {
    await openExplorer(page);
    await setCurve(page, '199999', '2', '3');
    await page.getByRole('button', { name: 'Find all points' }).click();
    // Change the curve straight away, while the search is still running.
    await page.getByLabel('Prime p').fill('23');
    await page.getByLabel('Coefficient a').fill('1');
    await page.getByLabel('Coefficient b').fill('1');
    await expect(page.getByTestId('points-idle')).toBeVisible();
    await findAllPoints(page);
    await expect(page.getByTestId('points-total')).toHaveText('28');
  });

  test('canceling a search and starting again', async ({ page }) => {
    await openExplorer(page);
    await setCurve(page, '199999', '2', '3');
    await page.getByRole('button', { name: 'Find all points' }).click();
    const cancel = page.getByRole('button', { name: 'Cancel' });
    if (await cancel.isVisible()) {
      await cancel.click();
      await expect(page.getByTestId('points-idle')).toBeVisible();
    }
    await findAllPoints(page);
    await expect(page.getByText('N is inside the bound')).toBeVisible();
  });

  test('odd but valid scalars', async ({ page }) => {
    await openExplorer(page);
    await choosePreset(page, 'E17(2, 2)');
    await openTab(page, 'Multiply');
    const cases: Array<[string, string]> = [
      ['-0', 'O'],
      ['0x0', 'O'],
      ['+0x2', '(6, 3)'],
      ['1_9', 'O'],
      [' 20 ', '(5, 1)'],
      ['-19', 'O'],
    ];
    for (const [k, expected] of cases) {
      await page.getByLabel('k', { exact: true }).fill(k);
      await page.getByRole('button', { name: 'Calculate kP' }).click();
      await expect(page.getByTestId('multiply-result'), k).toHaveText(expected);
    }
  });

  test('a 400-digit coordinate is refused politely', async ({ page }) => {
    await openExplorer(page);
    await openTab(page, 'Add points');
    await page.getByLabel('x of P').fill('9'.repeat(400));
    await expect(page.getByTestId('add-p-status')).toContainText('Not on the curve');
    await page.getByLabel('x of P').fill('9'.repeat(401));
    await expect(
      page.getByText('x of P is too long: at most 400 characters are accepted.'),
    ).toBeVisible();
  });

  test('pressing Calculate many times in a row gives one steady result', async ({ page }) => {
    await openExplorer(page);
    await openTab(page, 'Add points');
    const button = page.getByRole('button', { name: 'Calculate P + Q' });
    for (let press = 0; press < 8; press += 1) await button.click();
    await expect(page.getByTestId('add-result')).toHaveText('(17, 20)');
    await expect(page.getByTestId('add-result-section')).toHaveCount(1);
  });

  test('the real-number picture at singular and extreme coefficients', async ({ page }) => {
    await page.goto('/learn');
    const real = page.getByTestId('real-curve');
    // a = −3, b = 2 is singular (4a³ + 27b² = 0).
    await real.getByLabel('a', { exact: true }).fill('-3');
    await real.getByLabel('b', { exact: true }).fill('2');
    await expect(real.getByText('Singular curve')).toBeVisible();
    // Extreme values still draw without errors.
    await real.getByLabel('a', { exact: true }).fill('4');
    await real.getByLabel('b', { exact: true }).fill('-4');
    await real.getByLabel('x of P').fill('-3');
    await real.getByLabel('x of Q').fill('3.5');
    await expect(real.getByTestId('real-sum')).not.toBeEmpty();
  });

  test('practice answers with spaces, hexadecimal and a minus sign', async ({ page }) => {
    await page.goto('/practice');
    await page.getByLabel('Exercise').selectOption('inverse');
    const prompt = (await page.getByTestId('practice-prompt').textContent()) ?? '';
    const [, value, modulus] = prompt.match(/inverse of (\d+) modulo (\d+)/)!;
    // Work out the inverse here by brute force, then type it in an unusual form.
    let inverse = 1;
    while ((Number(value) * inverse) % Number(modulus) !== 1) inverse += 1;
    const step = page.getByTestId('step-inverse').getByRole('textbox');
    await step.fill(` 0x${inverse.toString(16)} `);
    await page.getByRole('button', { name: 'Check my answers' }).click();
    await expect(page.getByTestId('practice-success')).toBeVisible();
    await page.getByRole('button', { name: 'New exercise' }).click();
    await page.getByTestId('step-inverse').getByRole('textbox').fill('—');
    await page.getByRole('button', { name: 'Check my answers' }).click();
    await expect(page.getByTestId('step-inverse')).toContainText('Not a whole number');
  });

  test('script-looking text in the sign-up form stays text', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Email').fill('<img src=x onerror=alert(1)>@x.co');
    await page
      .getByLabel('Password', { exact: true })
      .fill('"><script>alert(1)</script>-long-enough');
    await page
      .getByLabel('Type the password again')
      .fill('"><script>alert(1)</script>-long-enough');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('signup-error')).toBeVisible();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  });

  test('the browser Back and Forward buttons and reloading a page', async ({ page }) => {
    await openExplorer(page);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Learn' })
      .click();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Practice' })
      .click();
    await page.goBack();
    await expect(page).toHaveURL(/\/learn$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/practice$/);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Practice' })).toBeVisible();
    await page.goto('/account');
    await expect(page).toHaveURL(/\/signin$/);
  });

  test('unbalanced markdown and very long questions in the assistant', async ({ page }) => {
    await openExplorer(page);
    await page.getByRole('button', { name: 'Assistant' }).click();
    const input = page.getByLabel('Your question');
    await input.fill('**curve `point');
    await input.press('Enter');
    await expect(page.getByTestId('assistant-question').last()).toContainText('**curve `point');
    await input.fill(`curve ${'x'.repeat(494)}`);
    await input.press('Enter');
    await expect(page.getByTestId('assistant-answer')).toHaveCount(2);
  });
});
