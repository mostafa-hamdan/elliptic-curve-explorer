/**
 * Tests for practice mode: every generated exercise must be solvable and its answers must
 * agree with the engine; the checker must accept correct work (also unreduced), point to
 * the first wrong step, and treat empty or non-numeric answers clearly.
 */
import { describe, expect, it } from 'vitest';
import { add, curveSides, mod, modInverse, multiply } from '@shared/ecc/index.ts';
import {
  checkAnswers,
  createExercise,
  EXERCISE_KINDS,
  isPracticePrime,
  type Random,
} from '../../client/src/features/practice/exercises.ts';

/** A small repeatable random source (a linear congruential generator). */
function seeded(seed: number): Random {
  let state = seed >>> 0;
  return (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % n;
  };
}

/** Fill every step with its correct answer. */
function solve(steps: Array<{ id: string; answer: bigint; type: string }>): Record<string, string> {
  return Object.fromEntries(
    steps.map((step) => [
      step.id,
      step.type === 'yes-no' ? (step.answer === 1n ? 'yes' : 'no') : step.answer.toString(),
    ]),
  );
}

describe('generated exercises', () => {
  for (const { id: kind } of EXERCISE_KINDS) {
    for (const difficulty of ['classroom', 'harder'] as const) {
      it(`${kind} (${difficulty}): 60 random exercises are consistent with the engine`, () => {
        const random = seeded(kind.length * 7919 + difficulty.length);
        for (let round = 0; round < 60; round += 1) {
          const exercise = createExercise(kind, difficulty, random);
          expect(exercise.steps.length).toBeGreaterThan(0);
          expect(checkAnswers(exercise, solve(exercise.steps)).allCorrect).toBe(true);
          if (exercise.curve) expect(isPracticePrime(Number(exercise.curve.p))).toBe(true);
          for (const step of exercise.steps) {
            expect(step.answer >= 0n && step.answer < step.modulus).toBe(true);
          }
        }
      });
    }
  }

  it('addition answers match the engine’s sum', () => {
    const random = seeded(42);
    for (let round = 0; round < 40; round += 1) {
      const exercise = createExercise('add', 'classroom', random);
      const [, xp, yp, xq, yq] = exercise.prompt.match(
        /P = \((\d+), (\d+)\) and Q = \((\d+), (\d+)\)/,
      )!;
      const curve = exercise.curve!;
      const P = { x: BigInt(xp!), y: BigInt(yp!) };
      const Q = { x: BigInt(xq!), y: BigInt(yq!) };
      const sum = add(curve, P, Q)!;
      const byId = Object.fromEntries(exercise.steps.map((step) => [step.id, step.answer]));
      expect(byId.x3).toBe(sum.x);
      expect(byId.y3).toBe(sum.y);
      expect(mod(byId.denominator! * byId.inverse!, curve.p)).toBe(1n);
    }
  });

  it('inverse answers are real inverses', () => {
    const random = seeded(7);
    for (let round = 0; round < 50; round += 1) {
      const exercise = createExercise('inverse', 'harder', random);
      const [, value, modulus] = exercise.prompt.match(/inverse of (\d+) modulo (\d+)/)!;
      expect(exercise.steps[0]!.answer).toBe(modInverse(BigInt(value!), BigInt(modulus!)));
    }
  });

  it('on-curve exercises give both answers over many rounds, and the verdict is right', () => {
    const random = seeded(99);
    const verdicts = new Set<bigint>();
    for (let round = 0; round < 60; round += 1) {
      const exercise = createExercise('on-curve', 'classroom', random);
      const [, x, y] = exercise.prompt.match(/\((\d+), (\d+)\)/)!;
      const sides = curveSides(exercise.curve!, BigInt(x!), BigInt(y!));
      const verdict = exercise.steps[2]!.answer;
      expect(verdict).toBe(sides.left === sides.right ? 1n : 0n);
      verdicts.add(verdict);
    }
    expect(verdicts).toEqual(new Set([0n, 1n]));
  });

  it('multiply exercises end with kP', () => {
    const random = seeded(5);
    for (let round = 0; round < 30; round += 1) {
      const exercise = createExercise('multiply', 'classroom', random);
      const [, k, xp, yp] = exercise.prompt.match(/compute (\d+)P for P = \((\d+), (\d+)\)/)!;
      const kP = multiply(exercise.curve!, BigInt(k!), { x: BigInt(xp!), y: BigInt(yp!) })!;
      const steps = exercise.steps;
      expect(steps[steps.length - 2]!.answer).toBe(kP.x);
      expect(steps[steps.length - 1]!.answer).toBe(kP.y);
    }
  });
});

describe('checking answers', () => {
  const exercise = createExercise('add', 'classroom', seeded(1));
  const correct = solve(exercise.steps);

  it('points to the first wrong step', () => {
    const answers = { ...correct, lambda: String(Number(correct.lambda) + 1) };
    const result = checkAnswers(exercise, answers);
    expect(result.allCorrect).toBe(false);
    expect(result.firstProblem).toBe(3);
    expect(result.statuses.lambda).toBe('wrong');
    expect(result.statuses.numerator).toBe('correct');
  });

  it('accepts an unreduced but congruent answer and says so', () => {
    const p = exercise.curve!.p;
    const answers = { ...correct, numerator: (BigInt(correct.numerator!) - p).toString() };
    const result = checkAnswers(exercise, answers);
    expect(result.allCorrect).toBe(true);
    expect(result.unreduced).toEqual(['numerator']);
  });

  it('marks empty and non-numeric answers', () => {
    const result = checkAnswers(exercise, { ...correct, x3: '', y3: 'twelve' });
    expect(result.statuses.x3).toBe('empty');
    expect(result.statuses.y3).toBe('invalid');
    expect(result.firstProblem).toBe(4);
  });

  it('checks yes / no steps', () => {
    const onCurve = createExercise('on-curve', 'classroom', seeded(3));
    const answers = solve(onCurve.steps);
    answers.verdict = answers.verdict === 'yes' ? 'no' : 'yes';
    expect(checkAnswers(onCurve, answers).statuses.verdict).toBe('wrong');
  });
});
