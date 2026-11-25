/**
 * Browser tests for the landing page and the "Learn ECC" topic pages: every section is
 * there, the links go where they say, the hero animation can be paused, the screenshots
 * load in both themes, and each topic's worked example matches the engine.
 */
import { chooseTheme, expect, test } from './fixtures.ts';

test.describe('landing page', () => {
  test('has every section, the team and the GitHub contact link', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('OnCurve · Elliptic Curve Explorer');
    for (const name of [
      'The three operations, fully worked',
      'Four short reads',
      'From a curve to a worked answer',
      'Careful with your account, honest about its limits',
      'Questions and answers',
      'Who made OnCurve',
      'Contact',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    await expect(page.getByText('A student project for EECE 632 at AUB')).toBeVisible();
    const team = page.getByTestId('team').locator('li');
    await expect(team).toHaveCount(4);
    for (const [index, name] of ['Mostafa', 'Maroun', 'Dimitri', 'Maher'].entries()) {
      await expect(team.nth(index)).toContainText(name);
    }
    await expect(page.getByRole('link', { name: /Open an issue on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/mostafa-hamdan/elliptic-curve-explorer/issues',
    );
    // No contact form anywhere on the page (the assistant's closed panel is not part of it).
    await expect(page.locator('main form')).toHaveCount(0);
  });

  test('the in-page menu jumps to its section', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'On this page' })
      .getByRole('link', { name: 'FAQ' })
      .click();
    await expect(page.getByRole('heading', { name: 'Questions and answers' })).toBeInViewport();
    await page.getByText('Do I need an account?').click();
    await expect(page.getByText('Every calculation, the Learn pages and practice')).toBeVisible();
  });

  test('the hero animation can be paused and played again', async ({ page }) => {
    await page.goto('/');
    const hero = page.getByTestId('curve-hero');
    await expect(hero.getByRole('img')).toBeVisible();
    await page.getByRole('button', { name: 'Pause the animation' }).click();
    await expect(page.getByRole('button', { name: 'Play the animation' })).toBeVisible();
    await page.getByRole('button', { name: 'Play the animation' }).click();
    await expect(page.getByRole('button', { name: 'Pause the animation' })).toBeVisible();
  });

  test('with reduced motion the hero is a still picture without a pause button', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('curve-hero').getByText('R = P + Q')).toBeVisible();
    await expect(page.getByTestId('hero-pause')).toHaveCount(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`the screenshots load in the ${theme} theme`, async ({ page }) => {
      await chooseTheme(page, theme);
      await page.goto('/#features');
      const shots = page.locator(`img[src$="-${theme}.jpg"]`);
      await expect(shots).toHaveCount(6);
      for (const shot of await shots.all()) {
        await shot.scrollIntoViewIfNeeded();
        await expect(shot).toBeVisible();
        await expect
          .poll(() => shot.evaluate((image: HTMLImageElement) => image.naturalWidth))
          .toBe(1280);
      }
      // The other theme's pictures stay hidden.
      const other = theme === 'light' ? 'dark' : 'light';
      for (const shot of await page.locator(`img[src$="-${other}.jpg"]`).all()) {
        await expect(shot).toBeHidden();
      }
    });
  }
});

test.describe('Learn ECC topics', () => {
  test('the four topics are linked from the landing page and from each other', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /What is an elliptic curve\?/ }).click();
    await expect(page).toHaveURL(/\/learn\/elliptic-curves$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What is an elliptic curve?');
    await expect(page.getByTestId('learn-topic')).toContainText('E23(1, 1) has 28 points');

    const pager = page.getByTestId('topic-pager');
    for (const title of ['Point addition', 'Scalar multiplication', 'ECC in real life']) {
      await pager.getByRole('link', { name: new RegExp(title) }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    }
    await page.getByRole('link', { name: 'Learn ECC' }).click();
    await expect(page.getByRole('heading', { name: 'Four short reads' })).toBeInViewport();
  });

  test('the worked examples match the engine and open in the Explorer', async ({ page }) => {
    await page.goto('/learn/point-addition');
    const topic = page.getByTestId('learn-topic');
    await expect(topic).toContainText('P + Q = (17, 20)');
    await expect(topic).toContainText('2P = (7, 12)');
    await page.getByRole('button', { name: 'Open in the Explorer' }).click();
    await expect(page).toHaveURL(/\/explorer$/);
    await expect(page.getByRole('tab', { name: 'Add points' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('button', { name: 'Calculate P + Q' }).click();
    await expect(page.getByTestId('add-result')).toHaveText('(17, 20)');

    await page.goto('/learn/scalar-multiplication');
    await expect(page.getByTestId('learn-topic')).toContainText('19P = O');
    await page.getByRole('button', { name: 'Open in the Explorer' }).click();
    await expect(page.getByLabel('k', { exact: true })).toHaveValue('13');
    await page.getByRole('button', { name: 'Calculate kP' }).click();
    // 13P on E17(2, 2) with P = (5, 1), checked by repeated addition in the engine tests.
    await expect(page.getByTestId('multiply-result')).toHaveText('(16, 4)');
  });

  test('an unknown topic shows Page not found', async ({ page }) => {
    await page.goto('/learn/no-such-topic');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});
