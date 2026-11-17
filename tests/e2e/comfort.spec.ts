/**
 * Browser tests for the comfort features: display settings (theme, text size), keyboard
 * shortcuts, Reset and Clear all, the guided tour, the Help page and the assistant.
 */
import { expect, openExplorer, openTab, test } from './fixtures.ts';

test.describe('display settings', () => {
  test('changes the text size and remembers it', async ({ page }) => {
    await openExplorer(page);
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);

    await page.getByRole('button', { name: 'Display settings' }).click();
    const dialog = page.getByTestId('settings-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByText('Larger', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(parseFloat(after)).toBeCloseTo(parseFloat(before) * 1.25, 1);

    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
  });

  test('switches the theme from the dialog', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openExplorer(page);
    await page.getByRole('button', { name: 'Display settings' }).click();
    await page.getByTestId('settings-dialog').getByText('Dark', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // Escape closes the dialog.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-dialog')).toBeHidden();
  });

  test('every text size keeps the Explorer free of sideways scrolling', async ({ page }) => {
    for (const size of ['small', 'large', 'larger']) {
      await page.addInitScript((value) => {
        window.localStorage.setItem('oncurve.textSize', value);
      }, size);
      await openExplorer(page);
      await expect(page.locator('html')).toHaveAttribute('data-text-size', size);
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(sideways, `text size ${size}`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('keyboard shortcuts', () => {
  test('switch tabs, focus p, toggle the theme and list the shortcuts', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openExplorer(page);

    await page.keyboard.press('2');
    await expect(page.getByRole('tab', { name: 'Add points' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('3');
    await expect(page.getByRole('tab', { name: 'Multiply' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.keyboard.press('/');
    await expect(page.getByLabel('Prime p')).toBeFocused();
    // While typing, single keys are text, not shortcuts.
    await page.keyboard.press('End');
    await page.keyboard.press('1');
    await expect(page.getByLabel('Prime p')).toHaveValue('231');
    await expect(page.getByRole('tab', { name: 'Multiply' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Alt + number works even inside a box.
    await page.keyboard.press('Alt+1');
    await expect(page.getByRole('tab', { name: 'All points' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('heading', { level: 1 }).click();
    await page.keyboard.press('t');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
    await expect(page.getByTestId('shortcuts-dialog').getByTestId('shortcuts-table')).toContainText(
      'Show the Multiply tab',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcuts-dialog')).toBeHidden();
  });

  test('a tab shortcut on another page returns to the Explorer', async ({ page }) => {
    await page.goto('/limitations');
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/\/explorer$/);
    await expect(page.getByRole('tab', { name: 'Multiply' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

test.describe('reset and clear', () => {
  test('Reset returns to the example; Clear all empties everything', async ({ page }) => {
    await openExplorer(page);
    await page.getByLabel('Example curves').selectOption({ label: 'secp256k1' });
    await openTab(page, 'Add points');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-result')).toBeVisible();

    await page.getByRole('button', { name: 'Reset to example' }).click();
    await expect(page.getByLabel('Prime p')).toHaveValue('23');
    await expect(page.getByLabel('x of P')).toHaveValue('3');
    await expect(page.getByTestId('add-result')).toHaveCount(0);
    // The tab the user was on stays open.
    await expect(page.getByRole('tab', { name: 'Add points' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByLabel('Prime p')).toHaveValue('');
    await expect(page.getByLabel('x of P')).toHaveValue('');
  });
});

test.describe('guided tour', () => {
  test('starts by itself on a first visit and can be skipped for good', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.removeItem('oncurve.tourDone'));
    // Never on the landing page: the tour waits until the Explorer itself is opened.
    await page.goto('/');
    await expect(page.getByTestId('landing')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('tour')).toHaveCount(0);
    await page.getByRole('link', { name: 'Open the explorer' }).first().click();
    const card = page.getByTestId('tour-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Welcome to OnCurve');
    await card.getByRole('button', { name: 'Skip tour' }).click();
    await expect(page.getByTestId('tour')).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem('oncurve.tourDone'))).toBe('1');
  });

  test('walks through every step, switching tabs on the way', async ({ page }) => {
    await page.goto('/help');
    await page.getByRole('button', { name: 'Take the guided tour' }).click();
    // The tour runs on the Explorer page.
    await expect(page).toHaveURL(/\/explorer$/);
    const card = page.getByTestId('tour-card');
    await expect(card).toContainText('Step 1 of');
    const total = Number((await card.textContent())?.match(/of (\d+)/)?.[1]);
    expect(total).toBeGreaterThanOrEqual(8);

    const titles: string[] = [];
    for (let step = 1; step <= total; step += 1) {
      await expect(card).toContainText(`Step ${step} of ${total}`);
      titles.push((await card.getByRole('heading').textContent()) ?? '');
      if (step === 6) {
        // The step about adding points shows the Add points tab.
        await expect(page.getByRole('tab', { name: 'Add points' })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      }
      await card.getByRole('button', { name: step === total ? 'Finish' : 'Next' }).click();
    }
    await expect(page.getByTestId('tour')).toHaveCount(0);
    expect(new Set(titles).size).toBe(total);
  });

  test('works with the keyboard: arrows to move, Escape to stop', async ({ page }) => {
    await openExplorer(page);
    await page.getByRole('button', { name: 'Display settings' }).click();
    await page.getByRole('button', { name: 'Show the guided tour' }).click();
    const card = page.getByTestId('tour-card');
    await expect(card).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(card).toContainText('Step 2 of');
    await page.keyboard.press('ArrowLeft');
    await expect(card).toContainText('Step 1 of');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tour')).toHaveCount(0);
  });
});

test.describe('Help page', () => {
  test('answers questions and lists the shortcuts', async ({ page }) => {
    await page.goto('/help');
    await expect(page).toHaveTitle('Help · OnCurve');
    await page.getByText('Why must p be a prime greater than 3?').click();
    await expect(page.getByText(/Division mod p always works when p is prime/)).toBeVisible();
    await expect(page.getByTestId('shortcuts-table')).toContainText('Jump to the prime p box');
  });
});

test.describe('assistant (offline helper)', () => {
  test('answers a suggested question and explains the last result', async ({ page }) => {
    await openExplorer(page);
    await openTab(page, 'Add points');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();

    await page.getByRole('button', { name: 'Assistant' }).click();
    const panel = page.getByTestId('assistant');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('assistant-mode')).toContainText('Offline helper');
    await expect(page.getByLabel('Your question')).toBeFocused();

    await panel.getByRole('button', { name: 'Explain my last result' }).click();
    const answer = panel.getByTestId('assistant-answer').last();
    await expect(answer).toContainText('The answer is (17, 20)');
    await expect(answer).toContainText('6⁻¹ ≡ 4');
  });

  test('takes typed questions, refuses other subjects and shows HTML as text', async ({ page }) => {
    await openExplorer(page);
    await page.keyboard.press('a');
    const panel = page.getByTestId('assistant');
    const input = page.getByLabel('Your question');
    await expect(input).toBeFocused();

    await input.fill('inverse of 6 mod 23');
    await input.press('Enter');
    await expect(panel.getByTestId('assistant-answer').last()).toContainText('6⁻¹ ≡ 4 (mod 23)');

    await input.fill('what is the capital of France?');
    await panel.getByRole('button', { name: 'Send' }).click();
    await expect(panel.getByTestId('assistant-answer').last()).toContainText(
      'I can only help with elliptic curves',
    );

    await input.fill('<img src=x onerror="window.hacked=1"> curve');
    await input.press('Enter');
    await expect(panel.getByTestId('assistant-question').last()).toContainText('<img src=x');
    expect(
      await page.evaluate(() => (window as unknown as { hacked?: number }).hacked),
    ).toBeUndefined();
    expect(await panel.locator('img').count()).toBe(0);
  });

  test('limits the question length and keeps the conversation when closed', async ({ page }) => {
    await openExplorer(page);
    await page.getByRole('button', { name: 'Assistant' }).click();
    const panel = page.getByTestId('assistant');
    const input = page.getByLabel('Your question');
    await input.fill('x'.repeat(501));
    await expect(panel.getByText('Too long: 501 of 500 characters')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Send' })).toBeDisabled();

    await input.fill('What is the point at infinity?');
    await input.press('Enter');
    await expect(panel.getByTestId('assistant-answer')).toHaveCount(1);

    await input.press('Escape');
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Assistant' }).click();
    await expect(panel.getByTestId('assistant-answer')).toHaveCount(1);
    await panel.getByRole('button', { name: 'Clear' }).click();
    await expect(panel.getByTestId('assistant-answer')).toHaveCount(0);
  });
});

test.describe('assistant (AI mode, with the server answers simulated)', () => {
  test('uses AI mode when available and falls back to the offline helper on failure', async ({
    page,
  }) => {
    let calls = 0;
    await page.route('**/api/assistant/status', (route) =>
      route.fulfill({ json: { ai: true, reason: 'AI mode is ready.' } }),
    );
    await page.route('**/api/assistant', async (route) => {
      calls += 1;
      const body = route.request().postDataJSON() as { question: string; context: string };
      expect(body.context).toContain('curve E23(1, 1)');
      await route.fulfill({
        json:
          calls === 1
            ? { answer: 'The sum is **(17, 20)**.', declined: false }
            : { fallback: 'The AI service cannot be reached (no internet?).' },
      });
    });

    await openExplorer(page);
    await page.getByRole('button', { name: 'Assistant' }).click();
    const panel = page.getByTestId('assistant');
    await expect(panel.getByTestId('assistant-mode')).toContainText('AI mode');

    const input = page.getByLabel('Your question');
    await input.fill('What is (3, 10) + (9, 7)?');
    await input.press('Enter');
    await expect(panel.getByTestId('assistant-answer').last()).toContainText(
      'The sum is (17, 20).',
    );
    await expect(panel.getByTestId('assistant-answer').last()).toContainText('AI answer');

    await input.fill('What is the point at infinity?');
    await input.press('Enter');
    const fallback = panel.getByTestId('assistant-answer').last();
    await expect(fallback.getByTestId('assistant-notice')).toContainText(
      'Answered by the offline helper',
    );
    await expect(fallback).toContainText('identity of the group');
  });
});
