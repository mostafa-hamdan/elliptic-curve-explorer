/**
 * Practice exercises: generating a small hand-sized problem, listing the steps the user
 * must write down, and checking their answers. The correct values always come from the
 * engine's own step data, so practice and Explorer can never disagree.
 */
import {
  addWithSteps,
  createCurve,
  curveSides,
  inverseTrace,
  isPrime,
  listPoints,
  mod,
  multiplyWithSteps,
  singularityValue,
  tryParseInteger,
  type AffinePoint,
  type Curve,
} from '@shared/ecc/index.ts';
import { pointText } from '../../lib/format.ts';

/** The kinds of exercise. */
export type ExerciseKind = 'add' | 'double' | 'inverse' | 'on-curve' | 'multiply';

/** Names shown in the menu. */
export const EXERCISE_KINDS: ReadonlyArray<{ id: ExerciseKind; label: string }> = [
  { id: 'add', label: 'Add P + Q' },
  { id: 'double', label: 'Double 2P' },
  { id: 'inverse', label: 'Modular inverse' },
  { id: 'on-curve', label: 'Is it on the curve?' },
  { id: 'multiply', label: 'Multiply kP' },
];

/** How large the numbers get. */
export type Difficulty = 'classroom' | 'harder';

/** One thing the user must work out. */
export interface PracticeStep {
  id: string;
  /** What to compute, for example "λ = numerator · inverse (mod p)". */
  label: string;
  /** For a number step: the answer is compared mod this value. */
  modulus: bigint;
  /** The correct answer. For a yes/no step, 1 means yes and 0 means no. */
  answer: bigint;
  /** "number" steps take a whole number; "yes-no" steps take a choice. */
  type: 'number' | 'yes-no';
  /** How to get it, shown when this is the first wrong step. Never gives the answer away. */
  hint: string;
  /** How the correct answer is reached, shown when the user asks for it. */
  working: string;
}

/** A generated exercise. */
export interface Exercise {
  kind: ExerciseKind;
  /** The task in one or two sentences. */
  prompt: string;
  /** The curve, for kinds that use one. */
  curve: Curve | null;
  steps: PracticeStep[];
  /** What to load into the Explorer to check the exercise there; null when not useful. */
  explore: {
    tab: 'add' | 'multiply';
    P: AffinePoint;
    Q?: AffinePoint;
    k?: bigint;
  } | null;
}

/** Random whole number from 0 to n − 1. Injected so tests can be repeatable. */
export type Random = (n: number) => number;

/** The default random source: the browser's cryptographic generator, for fair variety. */
export const cryptoRandom: Random = (n) => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]! % n;
};

/** Primes used for exercises at each difficulty. */
const PRIMES: Record<Difficulty, number[]> = {
  classroom: [11, 13, 17, 19, 23],
  harder: [29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97],
};

/** Pick one element of a list. */
function pick<T>(items: readonly T[], random: Random): T {
  return items[random(items.length)]!;
}

/**
 * A random non-singular curve with at least six ordinary points.
 *
 * @param difficulty - decides the size of p.
 * @param random - random source.
 * @returns the curve and its ordinary points.
 */
export function randomCurve(
  difficulty: Difficulty,
  random: Random,
): { curve: Curve; points: AffinePoint[] } {
  for (;;) {
    const p = BigInt(pick(PRIMES[difficulty], random));
    const a = BigInt(random(Number(p)));
    const b = BigInt(random(Number(p)));
    if (singularityValue(p, a, b) === 0n) continue;
    const curve = createCurve(p, a, b);
    const points = listPoints(curve);
    if (points.length >= 6) return { curve, points };
  }
}

/** The steps shared by addition and doubling: slope, inverse, λ, x₃, y₃. */
function slopeSteps(
  curve: Curve,
  P: AffinePoint,
  Q: AffinePoint,
  doubling: boolean,
): PracticeStep[] {
  const trace = addWithSteps(curve, P, Q);
  const slope = trace.slope!;
  const result = trace.result!;
  const p = curve.p;
  const inverse = slope.inverse.inverse!;
  return [
    {
      id: 'numerator',
      label: doubling ? 'Numerator 3x₁² + a (mod p)' : 'Numerator y₂ − y₁ (mod p)',
      modulus: p,
      answer: slope.numerator,
      type: 'number',
      hint: doubling
        ? 'Square x₁, multiply by 3, add a, then reduce mod p.'
        : 'Subtract the y of P from the y of Q. If the result is negative, add p.',
      working: `${slope.numeratorRaw} ≡ ${slope.numerator} (mod ${p})`,
    },
    {
      id: 'denominator',
      label: doubling ? 'Denominator 2y₁ (mod p)' : 'Denominator x₂ − x₁ (mod p)',
      modulus: p,
      answer: slope.denominator,
      type: 'number',
      hint: doubling
        ? 'Double the y of P and reduce mod p.'
        : 'Subtract the x of P from the x of Q. If the result is negative, add p.',
      working: `${slope.denominatorRaw} ≡ ${slope.denominator} (mod ${p})`,
    },
    {
      id: 'inverse',
      label: 'Inverse of the denominator (mod p)',
      modulus: p,
      answer: inverse,
      type: 'number',
      hint: 'Use the extended Euclidean algorithm, then check that denominator × inverse ≡ 1 (mod p).',
      working: `${slope.denominator} · ${inverse} = ${slope.denominator * inverse} ≡ 1 (mod ${p})`,
    },
    {
      id: 'lambda',
      label: 'Slope λ = numerator · inverse (mod p)',
      modulus: p,
      answer: slope.lambda,
      type: 'number',
      hint: 'Multiply your numerator by your inverse and reduce mod p.',
      working: `${slope.numerator} · ${inverse} = ${slope.product} ≡ ${slope.lambda} (mod ${p})`,
    },
    {
      id: 'x3',
      label: 'x₃ = λ² − x₁ − x₂ (mod p)',
      modulus: p,
      answer: result.x,
      type: 'number',
      hint: 'Square λ, subtract both x values, then reduce mod p.',
      working: `${slope.lambda}² − ${P.x} − ${Q.x} = ${trace.x3Raw} ≡ ${result.x} (mod ${p})`,
    },
    {
      id: 'y3',
      label: 'y₃ = λ(x₁ − x₃) − y₁ (mod p)',
      modulus: p,
      answer: result.y,
      type: 'number',
      hint: 'Use your x₃ here: λ times (x₁ − x₃), minus y₁, then reduce mod p.',
      working: `${slope.lambda} · (${P.x} − ${result.x}) − ${P.y} = ${trace.y3Raw} ≡ ${result.y} (mod ${p})`,
    },
  ];
}

/**
 * Create a new exercise.
 *
 * @param kind - which kind of exercise.
 * @param difficulty - size of the numbers.
 * @param random - random source (the cryptographic one by default).
 * @returns the exercise with its steps and their answers.
 */
export function createExercise(
  kind: ExerciseKind,
  difficulty: Difficulty,
  random: Random = cryptoRandom,
): Exercise {
  const name = (curve: Curve) => `E${curve.p}(${curve.a}, ${curve.b})`;

  switch (kind) {
    case 'add': {
      const { curve, points } = randomCurve(difficulty, random);
      // Two points with different x, so the chord rule applies (no special case).
      for (;;) {
        const P = pick(points, random);
        const Q = pick(points, random);
        if (P.x === Q.x) continue;
        return {
          kind,
          curve,
          prompt: `On ${name(curve)}, add P = ${pointText(P)} and Q = ${pointText(Q)}.`,
          steps: slopeSteps(curve, P, Q, false),
          explore: { tab: 'add', P, Q },
        };
      }
    }
    case 'double': {
      const { curve, points } = randomCurve(difficulty, random);
      const candidates = points.filter((point) => point.y !== 0n);
      const P = pick(candidates, random);
      return {
        kind,
        curve,
        prompt: `On ${name(curve)}, double P = ${pointText(P)}.`,
        steps: slopeSteps(curve, P, P, true),
        explore: { tab: 'add', P, Q: P },
      };
    }
    case 'inverse': {
      const modulus = BigInt(pick(PRIMES[difficulty], random));
      const value = BigInt(2 + random(Number(modulus) - 2));
      const trace = inverseTrace(value, modulus);
      return {
        kind,
        curve: null,
        explore: null,
        prompt: `Find the inverse of ${value} modulo ${modulus}.`,
        steps: [
          {
            id: 'inverse',
            label: `${value}⁻¹ (mod ${modulus})`,
            modulus,
            answer: trace.inverse!,
            type: 'number',
            hint: `Divide ${modulus} by ${value}, then keep dividing the previous divisor by the remainder until the remainder is 1, keeping the coefficients t.`,
            working: trace.steps
              .map(
                (step) =>
                  `${step.dividend} = ${step.quotient} · ${step.divisor} + ${step.remainder}`,
              )
              .join('; ')
              .concat(`. So ${value}⁻¹ ≡ ${trace.inverse}.`),
          },
        ],
      };
    }
    case 'on-curve': {
      const { curve, points } = randomCurve(difficulty, random);
      // Half the time a real point, half the time one that is off the curve.
      let x: bigint;
      let y: bigint;
      if (random(2) === 0) {
        ({ x, y } = pick(points, random));
      } else {
        do {
          x = BigInt(random(Number(curve.p)));
          y = BigInt(random(Number(curve.p)));
        } while (points.some((point) => point.x === x && point.y === y));
      }
      const { left, right } = curveSides(curve, x, y);
      return {
        kind,
        curve,
        prompt: `Is (${x}, ${y}) on ${name(curve)}?`,
        // The Add tab checks a typed point against the curve and shows both sides.
        explore: { tab: 'add', P: { x, y } },
        steps: [
          {
            id: 'left',
            label: 'Left side y² (mod p)',
            modulus: curve.p,
            answer: left,
            type: 'number',
            hint: 'Square y and reduce mod p.',
            working: `${y}² = ${y * y} ≡ ${left} (mod ${curve.p})`,
          },
          {
            id: 'right',
            label: 'Right side x³ + ax + b (mod p)',
            modulus: curve.p,
            answer: right,
            type: 'number',
            hint: 'Cube x, add a times x, add b, then reduce mod p.',
            working: `${x}³ + ${curve.a}·${x} + ${curve.b} = ${x ** 3n + curve.a * x + curve.b} ≡ ${right} (mod ${curve.p})`,
          },
          {
            id: 'verdict',
            label: 'Is the point on the curve?',
            modulus: 2n,
            answer: left === right ? 1n : 0n,
            type: 'yes-no',
            hint: 'The point is on the curve exactly when the two sides are equal.',
            working: left === right ? `Both sides are ${left}: yes.` : `${left} ≠ ${right}: no.`,
          },
        ],
      };
    }
    case 'multiply': {
      // A point whose order is larger than k, so no running result is O along the way.
      for (;;) {
        const { curve, points } = randomCurve(difficulty, random);
        const P = pick(points, random);
        const k = BigInt(3 + random(difficulty === 'classroom' ? 5 : 10));
        const trace = multiplyWithSteps(curve, k, P);
        if (trace.rows.some((row) => row.result === null)) continue;
        const steps: PracticeStep[] = [];
        for (const row of trace.rows.slice(1)) {
          const R = row.result!;
          const action = row.operation === 'double' ? 'double R' : 'double R, then add P';
          for (const axis of ['x', 'y'] as const) {
            steps.push({
              id: `row${row.index}-${axis}`,
              label: `Bit ${row.index + 1} is ${row.bit}: ${action}. ${axis} of R = ${row.multiple}P`,
              modulus: curve.p,
              answer: R[axis],
              type: 'number',
              hint:
                row.operation === 'double'
                  ? 'Double the previous R with the tangent rule.'
                  : 'Double the previous R with the tangent rule, then add P with the chord rule.',
              working: `${row.multiple}P = ${pointText(R)}`,
            });
          }
        }
        return {
          kind,
          curve,
          prompt: `On ${name(curve)}, compute ${k}P for P = ${pointText(P)} with double-and-add. ${k} = ${trace.bits}₂.`,
          steps,
          explore: { tab: 'multiply', P, k },
        };
      }
    }
  }
}

/** The outcome of checking one step. */
export type StepStatus = 'correct' | 'wrong' | 'empty' | 'invalid';

/** The outcome of checking a whole exercise. */
export interface CheckResult {
  statuses: Record<string, StepStatus>;
  /** Index of the first step that is not correct, or −1 when all are correct. */
  firstProblem: number;
  allCorrect: boolean;
  /** Steps answered correctly but not reduced to 0 … p − 1 (for example −3 for 20). */
  unreduced: string[];
}

/**
 * Check the user's answers.
 *
 * A number counts as correct when it is congruent to the answer mod p, so −3 is accepted
 * for 20 (mod 23); such answers are listed so the screen can suggest writing them reduced.
 *
 * @param exercise - the exercise.
 * @param inputs - what the user typed (or chose), by step id.
 * @returns the status of every step and the first one to look at.
 */
export function checkAnswers(exercise: Exercise, inputs: Record<string, string>): CheckResult {
  const statuses: Record<string, StepStatus> = {};
  const unreduced: string[] = [];
  let firstProblem = -1;

  exercise.steps.forEach((step, index) => {
    const text = inputs[step.id] ?? '';
    let status: StepStatus;
    if (text.trim() === '') {
      status = 'empty';
    } else if (step.type === 'yes-no') {
      status = (text === 'yes' ? 1n : 0n) === step.answer ? 'correct' : 'wrong';
    } else {
      const parsed = tryParseInteger(text, step.label);
      if (!parsed.ok) {
        status = 'invalid';
      } else if (mod(parsed.value, step.modulus) === step.answer) {
        status = 'correct';
        if (parsed.value !== step.answer) unreduced.push(step.id);
      } else {
        status = 'wrong';
      }
    }
    statuses[step.id] = status;
    if (status !== 'correct' && firstProblem === -1) firstProblem = index;
  });

  return { statuses, firstProblem, allCorrect: firstProblem === -1, unreduced };
}

/** True when p is a prime the practice generator may use (kept for the tests). */
export function isPracticePrime(p: number): boolean {
  return isPrime(BigInt(p)) && [...PRIMES.classroom, ...PRIMES.harder].includes(p);
}
