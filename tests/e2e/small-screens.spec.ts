/**
 * Every main screen at small window sizes (a phone, a small laptop window) and at the
 * largest text size: nothing may scroll sideways or be cut off, and the console must stay
 * clean. Screenshots are saved for a visual check.
 */
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  expect,
  expectNoOverflow,
  findAllPoints,
  openExplorer,
  openTab,
  test,
} from './fixtures.ts';

const SHOTS = 'test-results/small';

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'laptop-1024', width: 1024, height: 700 },
] as const;

/** The screens, each opened in a filled-in state. */
const SCREENS: Array<{ name: string; open: (page: Page) => Promise<void> }> = [
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
    },
  },
  {
    name: 'multiply-256',
    open: async (page) => {
      await openExplorer(page);
      await page.getByLabel('Example curves').selectOption({ label: 'NIST P-256' });
      await openTab(page, 'Multiply');
      await page.getByRole('button', { name: 'Calculate kP' }).click();
      await page.getByRole('button', { name: 'Show the working for step 2', exact: true }).click();
    },
  },
  { name: 'learn', open: async (page) => void (await page.goto('/learn')) },
  { name: 'practice', open: async (page) => void (await page.goto('/practice')) },
  { name: 'help', open: async (page) => void (await page.goto('/help')) },
  { name: 'limitations', open: async (page) => void (await page.goto('/limitations')) },
  { name: 'security', open: async (page) => void (await page.goto('/security')) },
  { name: 'signup', open: async (page) => void (await page.goto('/signup')) },
  {
    name: 'assistant',
    open: async (page) => {
      await openExplorer(page);
      await page.getByRole('button', { name: 'Assistant' }).click();
      await page
        .getByTestId('assistant')
        .getByRole('button', { name: 'Why must p be prime?' })
        .click();
    },
  },
];

test.describe('small windows and large text', () => {
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  for (const size of SIZES) {
    for (const screen of SCREENS) {
      test(`${screen.name} at ${size.name}`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await screen.open(page);
        await expectNoOverflow(page);
        await page.screenshot({ path: `${SHOTS}/${screen.name}-${size.name}.png`, fullPage: true });
      });
    }
  }

  test('the largest text size on a small laptop window', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('oncurve.textSize', 'larger'));
    await page.setViewportSize({ width: 1024, height: 700 });
    await openExplorer(page);
    await openTab(page, 'Add points');
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-result')).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({ path: `${SHOTS}/add-larger-text.png`, fullPage: true });
  });
});
