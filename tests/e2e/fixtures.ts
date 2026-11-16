/**
 * Shared setup for the browser tests.
 * Every test automatically fails if the page logs a console error or warning or throws
 * an uncaught exception, so a "working" screen with a hidden error cannot pass.
 * Also holds small helpers for the actions most tests repeat.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';

export const test = base.extend<{ consoleGuard: void; skipTour: void }>({
  // The guided tour opens on a first visit. Tests start as returning visitors so it does
  // not cover the page; the tour has its own tests, which turn this off.
  skipTour: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        try {
          window.localStorage.setItem('oncurve.tourDone', '1');
        } catch {
          // Storage blocked: nothing to do.
        }
      });
      await use();
    },
    { auto: true },
  ],
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
          problems.push(`[${message.type()}] ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => problems.push(`[uncaught] ${error.message}`));

      await use();

      expect(problems, 'the browser console must stay free of errors and warnings').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Open the Explorer page and wait until it is ready. */
export async function openExplorer(page: Page): Promise<void> {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Elliptic Curve Explorer' }),
  ).toBeVisible();
}

/** Type a curve into the three boxes of the curve panel. */
export async function setCurve(page: Page, p: string, a: string, b: string): Promise<void> {
  await page.getByLabel('Prime p').fill(p);
  await page.getByLabel('Coefficient a').fill(a);
  await page.getByLabel('Coefficient b').fill(b);
}

/** Choose one of the example curves by its menu label. */
export async function choosePreset(page: Page, label: string): Promise<void> {
  await page.getByLabel('Example curves').selectOption({ label });
}

/** Switch to one of the three tabs. */
export async function openTab(
  page: Page,
  name: 'All points' | 'Add points' | 'Multiply',
): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

/** Type a point into the boxes of the current tab. */
export async function setPoint(page: Page, which: 'P' | 'Q', x: string, y: string): Promise<void> {
  await page.getByLabel(`x of ${which}`).fill(x);
  await page.getByLabel(`y of ${which}`).fill(y);
}

/** Run the search on the All points tab and wait for the result. */
export async function findAllPoints(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Find all points' }).click();
  await expect(page.getByTestId('points-result')).toBeVisible({ timeout: 20_000 });
}

/** Choose the light or dark theme before the page loads. */
export async function chooseTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('oncurve.theme', value);
  }, theme);
}

/**
 * Run the automated accessibility check (axe) on the current page.
 * Fails on any violation of the WCAG 2.1 A and AA rules.
 */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.length} element(s), first: ${violation.nodes[0]?.target.join(' ')})`,
  );
  expect(summary, 'accessibility violations').toEqual([]);
}

/**
 * Check that nothing sticks out of the page sideways and no text is cut off.
 * Scrollable areas (tables that scroll on purpose) are allowed to hold wider content.
 */
export async function expectNoOverflow(page: Page): Promise<void> {
  const report = await page.evaluate(() => {
    const root = document.documentElement;
    const clipped: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const style = getComputedStyle(element);
      const hidesOverflow = style.overflowX === 'hidden' || style.overflowX === 'clip';
      // Screen-reader-only text is clipped on purpose.
      const visuallyHidden = style.position === 'absolute' && element.clientWidth <= 1;
      if (hidesOverflow && !visuallyHidden && element.scrollWidth > element.clientWidth + 1) {
        clipped.push(`${element.tagName.toLowerCase()}.${element.className}`.slice(0, 120));
      }
    }
    // The footer must be the last thing on the page: any gap under it means some element
    // is stretching the page beyond its content.
    const footer = document.querySelector('footer');
    const footerEnd = footer ? footer.getBoundingClientRect().bottom + window.scrollY : 0;
    return {
      sideways: root.scrollWidth - root.clientWidth,
      clipped,
      gapUnderFooter: Math.round(root.scrollHeight - footerEnd),
    };
  });
  expect(report.gapUnderFooter, 'no empty space below the footer').toBeLessThanOrEqual(1);
  expect(report.sideways, 'the page must not scroll sideways').toBeLessThanOrEqual(0);
  expect(report.clipped, 'no element may cut off its content').toEqual([]);
}
