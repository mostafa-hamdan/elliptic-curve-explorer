/**
 * Browser tests for practice mode: solving an exercise, being pointed to the first wrong
 * step with a hint, the progress record, the yes / no exercise, and opening an exercise
 * in the Explorer. The expected answers are computed here with the engine itself.
 */
import type { Page } from '@playwright/test';
import { addWithSteps, createCurve, curveSides, mod } from '../../shared/ecc/index.ts';
import { expect, test } from './fixtures.ts';

/** Read the curve and the points from the exercise text. */
async function readAddExercise(page: Page) {
  const prompt = (await page.getByTestId('practice-prompt').textContent()) ?? '';
  const match = prompt.match(
    /On E(\d+)\((\d+), (\d+)\), add P = \((\d+), (\d+)\) and Q = \((\d+), (\d+)\)/,
  );
  if (!match) throw new Error(`Unexpected exercise: ${prompt}`);
  const [p, a, b, x1, y1, x2, y2] = match.slice(1).map((value) => BigInt(value));
  const curve = createCurve(p!, a!, b!);
  return addWithSteps(curve, { x: x1!, y: y1! }, { x: x2!, y: y2! });
}

test.describe('practice mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/practice');
    await expect(page).toHaveTitle('Practice · OnCurve');
  });

  test('points to the first wrong step, then accepts the fixed answers', async ({ page }) => {
    const trace = await readAddExercise(page);
    const slope = trace.slope!;
    const answers: Record<string, bigint> = {
      numerator: slope.numerator,
      denominator: slope.denominator,
      inverse: slope.inverse.inverse!,
      lambda: mod(slope.lambda + 1n, 1000n), // deliberately wrong
      x3: trace.result!.x,
      y3: trace.result!.y,
    };
    for (const [id, value] of Object.entries(answers)) {
      await page.getByTestId(`step-${id}`).getByRole('textbox').fill(value.toString());
    }
    await page.getByRole('button', { name: 'Check my answers' }).click();

    const lambdaStep = page.getByTestId('step-lambda');
    await expect(lambdaStep.getByTestId('practice-hint')).toContainText('Start here.');
    await expect(lambdaStep).toContainText('Not right');
    await expect(page.getByTestId('step-numerator')).toContainText('Correct');
    await expect(page.getByTestId('practice-summary')).toContainText('Step 4 is highlighted');

    await lambdaStep.getByRole('button', { name: 'Show how' }).click();
    await expect(lambdaStep.getByTestId('practice-working')).toContainText(`≡ ${slope.lambda}`);

    await lambdaStep.getByRole('textbox').fill(slope.lambda.toString());
    await page.getByRole('button', { name: 'Check my answers' }).click();
    await expect(page.getByTestId('practice-success')).toBeVisible();
    await expect(page.getByTestId('practice-record')).toContainText('1 solved of 1 exercise tried');

    // The record survives a reload, and a new exercise starts empty.
    await page.reload();
    await expect(page.getByTestId('practice-record')).toContainText('1 solved of 1 exercise tried');
  });

  test('accepts an unreduced answer and suggests the reduced form', async ({ page }) => {
    const trace = await readAddExercise(page);
    const p = (await page.getByTestId('practice-prompt').textContent())!.match(/E(\d+)/)![1]!;
    await page
      .getByTestId('step-numerator')
      .getByRole('textbox')
      .fill((trace.slope!.numerator - BigInt(p)).toString());
    await page.getByRole('button', { name: 'Check my answers' }).click();
    await expect(page.getByTestId('step-numerator')).toContainText(
      'it is usual to write it reduced',
    );
    await expect(page.getByTestId('step-denominator').getByTestId('practice-hint')).toBeVisible();
  });

  test('explains empty and non-numeric answers', async ({ page }) => {
    await page.getByTestId('step-numerator').getByRole('textbox').fill('abc');
    await page.getByRole('button', { name: 'Check my answers' }).click();
    await expect(page.getByTestId('step-numerator')).toContainText('Not a whole number');
    await expect(page.getByTestId('step-denominator')).toContainText('No answer yet');
  });

  test('the yes / no exercise', async ({ page }) => {
    await page.getByLabel('Exercise').selectOption('on-curve');
    const prompt = (await page.getByTestId('practice-prompt').textContent()) ?? '';
    const [, x, y, p, a, b] = prompt
      .match(/Is \((\d+), (\d+)\) on E(\d+)\((\d+), (\d+)\)/)!
      .map(String);
    const sides = curveSides(
      createCurve(BigInt(p!), BigInt(a!), BigInt(b!)),
      BigInt(x!),
      BigInt(y!),
    );
    await page.getByTestId('step-left').getByRole('textbox').fill(sides.left.toString());
    await page.getByTestId('step-right').getByRole('textbox').fill(sides.right.toString());
    await page
      .getByTestId('step-verdict')
      .getByText(sides.left === sides.right ? 'Yes' : 'No', { exact: true })
      .click();
    await page.getByRole('button', { name: 'Check my answers' }).click();
    await expect(page.getByTestId('practice-success')).toBeVisible();
  });

  test('every kind and size produces an exercise', async ({ page }) => {
    for (const kind of ['add', 'double', 'inverse', 'on-curve', 'multiply']) {
      await page.getByLabel('Exercise').selectOption(kind);
      for (const size of ['p ≤ 97', 'p ≤ 23']) {
        await page.getByText(size, { exact: true }).click();
        await expect(page.getByTestId('practice-prompt')).not.toBeEmpty();
        await page.getByRole('button', { name: 'New exercise' }).click();
        await expect(page.getByTestId('practice-prompt')).not.toBeEmpty();
      }
    }
  });

  test('opens the exercise in the Explorer with the same curve and points', async ({ page }) => {
    const prompt = (await page.getByTestId('practice-prompt').textContent()) ?? '';
    const [, p, , , x1, y1] = prompt.match(/E(\d+)\((\d+), (\d+)\), add P = \((\d+), (\d+)\)/)!;
    await page.getByRole('button', { name: 'Open in the Explorer' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('tab', { name: 'Add points' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Prime p')).toHaveValue(p!);
    await expect(page.getByLabel('x of P')).toHaveValue(x1!);
    await expect(page.getByLabel('y of P')).toHaveValue(y1!);
  });
});
