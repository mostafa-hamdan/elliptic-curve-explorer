/**
 * Takes the screenshots shown on the landing page (client/public/screens) and in the
 * README (docs/screenshots), in the light and the dark theme, from the real app. Run it after a visible change to the Explorer:
 *     npx tsx scripts/capture-screens.ts
 * It builds the website, starts a private copy of the server on port 3101 with an
 * in-memory database, drives it with Playwright, and stops the server again.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';

/** The project folder; works with spaces in the path. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = fileURLToPath(new URL('../client/public/screens/', import.meta.url));
/** The README's picture folder. */
const DOCS = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;
/** Size of every picture. The landing page shows them scaled down. */
const VIEWPORT = { width: 1280, height: 800 };

/**
 * Start the server and wait until it answers.
 *
 * @returns the running server process.
 * @throws Error when the server does not answer within 60 seconds.
 */
async function startServer(): Promise<ChildProcess> {
  const server = spawn('npx tsx server/index.ts', {
    cwd: ROOT,
    shell: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: ':memory:',
      SESSION_SECRET: 'screenshot-secret-screenshot-secret-123',
      ANTHROPIC_API_KEY: '',
      OPEN_BROWSER: '0',
    },
  });
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return server;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stopServer(server);
  throw new Error('The server did not start within 60 seconds.');
}

/**
 * Stop the server and everything it started. On Windows the process is a shell wrapping
 * the server, so the whole process tree has to be ended, not only the shell.
 *
 * @param server - the process from {@link startServer}.
 */
function stopServer(server: ChildProcess): void {
  if (process.platform === 'win32' && server.pid !== undefined) {
    spawnSync(`taskkill /pid ${server.pid} /T /F`, { shell: true, stdio: 'ignore' });
  } else {
    server.kill();
  }
}

/**
 * Open a page as a returning guest (no tour, no guest banner) in the given theme.
 *
 * @param browser - the running browser.
 * @param theme - 'light' or 'dark'.
 * @returns a fresh page in its own context.
 */
async function freshPage(browser: Browser, theme: 'light' | 'dark'): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  await context.addInitScript((value) => {
    window.localStorage.setItem('oncurve.theme', value);
    window.localStorage.setItem('oncurve.tourDone', '1');
    window.sessionStorage.setItem('oncurve.guestBannerHidden', '1');
  }, theme);
  return context.newPage();
}

/**
 * Save the current window as a JPEG.
 *
 * @param folder - where to save it (the landing page's folder unless stated).
 */
async function shoot(page: Page, name: string, theme: string, folder = OUT): Promise<void> {
  // Let fonts and pictures settle before the picture is taken.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${folder}${name}-${theme}.jpg`, type: 'jpeg', quality: 84 });
  console.info(`  ${name}-${theme}.jpg`);
}

/** Bring an element to just under the sticky top bar. */
async function scrollToTop(page: Page, selector: string): Promise<void> {
  await page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: 'instant' });
    });
}

/**
 * Take every picture in one theme.
 *
 * @param browser - the running browser.
 * @param theme - 'light' or 'dark'.
 */
async function captureTheme(browser: Browser, theme: 'light' | 'dark'): Promise<void> {
  const page = await freshPage(browser, theme);

  // The landing page, for the README only (the landing page does not show itself).
  await page.goto(`${BASE}/`);
  await page.getByTestId('curve-hero').waitFor();
  await shoot(page, 'landing', theme, DOCS);

  // All points of E23(1, 1).
  await page.goto(`${BASE}/explorer`);
  await page.getByRole('button', { name: 'Find all points' }).click();
  await page.getByTestId('points-result').waitFor();
  await shoot(page, 'points', theme);

  // (3, 10) + (9, 7) with its steps.
  await page.getByRole('tab', { name: 'Add points' }).click();
  await page.getByRole('button', { name: 'Calculate P + Q' }).click();
  await page.getByTestId('add-result').waitFor();
  await scrollToTop(page, '[data-testid="add-result-section"]');
  await shoot(page, 'add', theme);

  // kP on secp256k1.
  await page.getByLabel('Example curves').selectOption({ label: 'secp256k1' });
  await page.getByRole('tab', { name: 'Multiply' }).click();
  await page.getByRole('button', { name: 'Calculate kP' }).click();
  await page.getByTestId('multiply-result').waitFor();
  await scrollToTop(page, '[role="tablist"]');
  await shoot(page, 'multiply', theme);

  // Practice and Learn.
  await page.goto(`${BASE}/practice`);
  await page.getByRole('heading', { level: 1, name: 'Practice' }).waitFor();
  await shoot(page, 'practice', theme);
  await page.goto(`${BASE}/learn`);
  await scrollToTop(page, '#learn-add');
  await shoot(page, 'learn', theme);

  // An account with a saved curve and some history.
  await page.goto(`${BASE}/signup`);
  await page.getByLabel('Email').fill(`student-${theme}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('tangent chord mirror orbit');
  await page.getByLabel('Type the password again').fill('tangent chord mirror orbit');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('I have saved my recovery codes somewhere safe.').check();
  await page.getByRole('button', { name: 'Continue to my account' }).click();
  await page.goto(`${BASE}/explorer`);
  await page.getByLabel('Example curves').selectOption({ label: 'E17(2, 2)' });
  await page.getByRole('button', { name: 'Save curve' }).click();
  await page.getByTestId('save-dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('tab', { name: 'All points' }).click();
  await page.getByRole('button', { name: 'Find all points' }).click();
  await page.getByTestId('points-result').waitFor();
  await page.getByRole('tab', { name: 'Multiply' }).click();
  await page.getByRole('button', { name: 'Calculate kP' }).click();
  await page.getByTestId('multiply-result').waitFor();
  await page.goto(`${BASE}/account`);
  await page.getByRole('heading', { level: 1, name: 'Your account' }).waitFor();
  await page.waitForTimeout(600);
  await shoot(page, 'account', theme);

  await page.context().close();
}

/** Build, start the server, take the pictures, stop the server. */
async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  console.info('Building the website...');
  const build = spawnSync('npm run build --silent', { cwd: ROOT, shell: true, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('The build failed.');

  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark'] as const) {
      console.info(`Taking the ${theme} pictures:`);
      await captureTheme(browser, theme);
    }
  } finally {
    await browser.close();
    stopServer(server);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
