/**
 * Browser tests for the app as a whole: navigation, the Limitations and not-found
 * pages, the light and dark themes, the automated accessibility check, and screenshots
 * of every screen at 1366×768 and 1920×1080 with a check that nothing overflows.
 */
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  chooseTheme,
  expect,
  expectAccessible,
  expectNoOverflow,
  findAllPoints,
  openExplorer,
  openTab,
  test,
} from './fixtures.ts';

/** Folder for the screenshots taken by these tests (not committed). */
const SHOTS = 'test-results/screens';

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
] as const;

const THEMES = ['light', 'dark'] as const;

/** The screens of the app, each with the steps that bring it into a filled-in state. */
const SCREENS: Array<{ name: string; open: (page: Page) => Promise<void> }> = [
  {
    name: 'explorer-start',
    open: async (page) => {
      await openExplorer(page);
    },
  },
  {
    name: 'points',
    open: async (page) => {
      await openExplorer(page);
      await findAllPoints(page);
    },
  },
  {
    name: 'add',
    open: async (page) => {
      await openExplorer(page);
      await openTab(page, 'Add points');
      await page.getByRole('button', { name: 'Calculate P + Q' }).click();
      await expect(page.getByTestId('add-result')).toBeVisible();
    },
  },
  {
    name: 'add-problem',
    open: async (page) => {
      await openExplorer(page);
      await openTab(page, 'Add points');
      await page.getByLabel('y of P').fill('11');
      await page.getByLabel('x of Q').fill('abc');
      await page.getByRole('button', { name: 'Calculate P + Q' }).click();
      await expect(page.getByTestId('add-problem')).toBeVisible();
    },
  },
  {
    name: 'multiply',
    open: async (page) => {
      await openExplorer(page);
      await openTab(page, 'Multiply');
      await page.getByLabel('k', { exact: true }).fill('13');
      await page.getByRole('button', { name: 'Calculate kP' }).click();
      await page.getByRole('button', { name: 'Show the working for step 2', exact: true }).click();
      await expect(page.getByTestId('multiply-row-detail')).toBeVisible();
    },
  },
  {
    name: 'multiply-256',
    open: async (page) => {
      await openExplorer(page);
      await page.getByLabel('Example curves').selectOption({ label: 'secp256k1' });
      await openTab(page, 'Multiply');
      await page.getByRole('button', { name: 'Calculate kP' }).click();
      await expect(page.getByTestId('multiply-result')).toBeVisible();
    },
  },
  {
    name: 'curve-invalid',
    open: async (page) => {
      await openExplorer(page);
      await page.getByLabel('Prime p').fill('21');
      await page.getByLabel('Coefficient a').fill('x');
      await expect(page.getByTestId('curve-status')).toContainText('Not a valid curve yet');
    },
  },
  {
    name: 'learn',
    open: async (page) => {
      await page.goto('/learn');
      await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
    },
  },
  {
    name: 'animation',
    open: async (page) => {
      await openExplorer(page);
      await page.getByLabel('Example curves').selectOption({ label: 'E17(2, 2)' });
      await openTab(page, 'Multiply');
      await page.getByRole('button', { name: 'Animate multiples of P' }).click();
      await page.getByTestId('multiples-dialog').getByRole('button', { name: 'Pause' }).click();
      for (let step = 0; step < 6; step += 1) {
        await page
          .getByTestId('multiples-dialog')
          .getByRole('button', { name: 'Next multiple' })
          .click();
      }
    },
  },
  {
    name: 'practice',
    open: async (page) => {
      await page.goto('/practice');
      await page.getByTestId('step-numerator').getByRole('textbox').fill('0');
      await page.getByRole('button', { name: 'Check my answers' }).click();
      await expect(page.getByTestId('practice-summary')).toBeVisible();
    },
  },
  {
    name: 'help',
    open: async (page) => {
      await page.goto('/help');
      await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
    },
  },
  {
    name: 'assistant',
    open: async (page) => {
      await openExplorer(page);
      await openTab(page, 'Add points');
      await page.getByRole('button', { name: 'Calculate P + Q' }).click();
      await page.getByRole('button', { name: 'Assistant' }).click();
      await page
        .getByTestId('assistant')
        .getByRole('button', { name: 'Explain my last result' })
        .click();
      await expect(page.getByTestId('assistant-answer')).toBeVisible();
    },
  },
  {
    name: 'settings',
    open: async (page) => {
      await openExplorer(page);
      await page.getByRole('button', { name: 'Display settings' }).click();
      await expect(page.getByTestId('settings-dialog')).toBeVisible();
    },
  },
  {
    name: 'tour',
    open: async (page) => {
      await openExplorer(page);
      await page.getByRole('button', { name: 'Display settings' }).click();
      await page.getByRole('button', { name: 'Show the guided tour' }).click();
      await page.getByTestId('tour-card').getByRole('button', { name: 'Next' }).click();
      await expect(page.getByTestId('tour-card')).toContainText('Step 2 of');
    },
  },
  {
    name: 'limitations',
    open: async (page) => {
      await page.goto('/limitations');
      await expect(page.getByRole('heading', { level: 1, name: 'Limitations' })).toBeVisible();
    },
  },
  {
    name: 'not-found',
    open: async (page) => {
      await page.goto('/no-such-page');
      await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    },
  },
];

test.describe('navigation and pages', () => {
  test('moves between the Explorer and the Limitations page and keeps the work', async ({
    page,
  }) => {
    await openExplorer(page);
    await expect(page).toHaveTitle('Explorer · OnCurve');
    await findAllPoints(page);

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Limitations' })
      .click();
    await expect(page).toHaveURL(/\/limitations$/);
    await expect(page).toHaveTitle('Limitations · OnCurve');
    await expect(page.getByTestId('limitations-list').locator('li')).toHaveCount(9);
    await expect(page.getByText('Works for primes up to p = 200,000.')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Explorer' })
      .click();
    // The list of points found before leaving is still there.
    await expect(page.getByTestId('points-total')).toHaveText('28');
  });

  test('the footer link opens the Limitations page', async ({ page }) => {
    await openExplorer(page);
    await page.getByRole('link', { name: 'What this app cannot do' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Limitations' })).toBeVisible();
  });

  test('a page address opened directly works (no 404 from the server)', async ({ page }) => {
    const response = await page.goto('/limitations');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Limitations' })).toBeVisible();
  });

  test('an unknown address shows the not-found page with a way back', async ({ page }) => {
    await page.goto('/this/does/not/exist');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to the Explorer' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Elliptic Curve Explorer' }),
    ).toBeVisible();
  });

  test('the tabs work with the keyboard', async ({ page }) => {
    await openExplorer(page);
    await page.getByRole('tab', { name: 'All points' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Add points' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Add points' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Multiply' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'All points' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Multiply' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'All points' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('the copy button copies the result', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions can only be granted in Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openExplorer(page);
    await openTab(page, 'Add points');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await page.getByRole('button', { name: 'Copy result' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('(17, 20)');
  });
});

test.describe('themes', () => {
  test('follows the system setting on a first visit', async ({ browser }) => {
    for (const scheme of THEMES) {
      const context = await browser.newContext({ colorScheme: scheme });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      await context.close();
    }
  });

  test('the switch changes the theme and the choice survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openExplorer(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('every screen: accessibility, overflow and screenshots', () => {
  test.beforeAll(() => {
    mkdirSync(SHOTS, { recursive: true });
  });

  for (const theme of THEMES) {
    for (const screen of SCREENS) {
      test(`${screen.name} in the ${theme} theme`, async ({ page, browserName }) => {
        await chooseTheme(page, theme);
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await screen.open(page);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expectNoOverflow(page);
          // Capture from the top, so the sticky top bar is drawn where a reader sees it.
          // The tour is pinned to the window, so it is captured as the window shows it.
          if (screen.name !== 'tour') await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: `${SHOTS}/${browserName}-${screen.name}-${theme}-${viewport.name}.png`,
            fullPage: screen.name !== 'tour',
          });
        }
        // The accessibility rules do not depend on the window size; check once.
        await expectAccessible(page);
      });
    }
  }
});
