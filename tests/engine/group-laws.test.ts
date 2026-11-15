/**
 * Group-law tests: the points of a curve must behave as a group under addition.
 * Identity, inverses, closure and commutativity are checked for every pair of points on
 * many small curves; associativity is checked on random triples. The "with steps"
 * addition must agree with the fast one and its recorded numbers must be consistent.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  add,
  addWithSteps,
  createCurve,
  double,
  isOnCurve,
  mod,
  negate,
  pointsEqual,
  type Curve,
} from '@shared/ecc/index.ts';
import { allPoints, isSingularNaive, SAMPLE_CURVES } from './helpers.ts';

/** Every non-singular curve over the small primes 5, 7, 11 and 13. */
function everySmallCurve(): Curve[] {
  const curves: Curve[] = [];
  for (const p of [5, 7, 11, 13]) {
    for (let a = 0; a < p; a += 1) {
      for (let b = 0; b < p; b += 1) {
        if (!isSingularNaive(p, a, b)) curves.push(createCurve(BigInt(p), BigInt(a), BigInt(b)));
      }
    }
  }
  return curves;
}

const CURVES: readonly Curve[] = [...SAMPLE_CURVES, ...everySmallCurve()];

describe('group laws on every pair of points', () => {
  it(`holds on ${CURVES.length} curves`, () => {
    let pairs = 0;
    for (const curve of CURVES) {
      const points = allPoints(curve);
      const name = `E${curve.p}(${curve.a}, ${curve.b})`;

      for (const p of points) {
        // Identity: P + O = O + P = P.
        if (!pointsEqual(add(curve, p, null), p) || !pointsEqual(add(curve, null, p), p)) {
          throw new Error(`${name}: identity fails`);
        }
        // Inverse: P + (−P) = O, and −P is on the curve.
        const minus = negate(curve, p);
        if (!isOnCurve(curve, minus) || add(curve, p, minus) !== null) {
          throw new Error(`${name}: inverse fails`);
        }
        // Doubling is the same as adding a point to itself.
        if (!pointsEqual(double(curve, p), add(curve, p, p))) {
          throw new Error(`${name}: doubling fails`);
        }

        for (const q of points) {
          const sum = add(curve, p, q);
          // Closure: the sum is again a point of the curve.
          if (!isOnCurve(curve, sum)) throw new Error(`${name}: sum is off the curve`);
          // Commutativity: P + Q = Q + P.
          if (!pointsEqual(sum, add(curve, q, p))) throw new Error(`${name}: not commutative`);
          // The version with steps gives the same answer.
          if (!pointsEqual(sum, addWithSteps(curve, p, q).result)) {
            throw new Error(`${name}: addWithSteps disagrees with add`);
          }
          pairs += 1;
        }
      }
    }
    expect(pairs).toBeGreaterThan(20_000);
  });

  it('is associative for every triple on E23(1, 1)', () => {
    const curve = createCurve(23n, 1n, 1n);
    const points = allPoints(curve);
    for (const p of points) {
      for (const q of points) {
        const pq = add(curve, p, q);
        for (const r of points) {
          if (!pointsEqual(add(curve, pq, r), add(curve, p, add(curve, q, r)))) {
            throw new Error('associativity fails on E23(1, 1)');
          }
        }
      }
    }
  });

  it('is associative on random triples from random curves', () => {
    const primes = [5n, 7n, 11n, 13n, 17n, 23n, 97n, 751n, 7919n];
    fc.assert(
      fc.property(
        fc.constantFrom(...primes),
        fc.bigInt({ min: 0n, max: 10_000n }),
        fc.bigInt({ min: 0n, max: 10_000n }),
        fc.tuple(fc.nat(), fc.nat(), fc.nat()),
        (p, a, b, [i, j, k]) => {
          fc.pre(mod(4n * a ** 3n + 27n * b ** 2n, p) !== 0n);
          const curve = createCurve(p, a, b);
          const points = allPoints(curve);
          const P = points[i % points.length]!;
          const Q = points[j % points.length]!;
          const R = points[k % points.length]!;
          return pointsEqual(add(curve, add(curve, P, Q), R), add(curve, P, add(curve, Q, R)));
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe('addition steps are internally consistent', () => {
  it('records numbers that reproduce the result, for every pair on four curves', () => {
    for (const curve of SAMPLE_CURVES.slice(0, 4)) {
      const p = curve.p;
      const points = allPoints(curve);
      for (const P of points) {
        for (const Q of points) {
          const trace = addWithSteps(curve, P, Q);
          if (trace.slope === null) {
            expect(trace.x3Raw).toBeNull();
            expect(trace.y3Raw).toBeNull();
            continue;
          }
          const s = trace.slope;
          expect(mod(s.numeratorRaw, p)).toBe(s.numerator);
          expect(mod(s.denominatorRaw, p)).toBe(s.denominator);
          expect(mod(s.denominator * s.inverse.inverse!, p)).toBe(1n);
          expect(s.product).toBe(s.numerator * s.inverse.inverse!);
          expect(mod(s.product, p)).toBe(s.lambda);
          // λ really is the slope: λ · denominator ≡ numerator.
          expect(mod(s.lambda * s.denominator, p)).toBe(s.numerator);
          expect(trace.result).toEqual({ x: mod(trace.x3Raw!, p), y: mod(trace.y3Raw!, p) });
        }
      }
    }
  });

  it('names the case that applied', () => {
    const curve = createCurve(23n, 1n, 0n);
    const P = { x: 9n, y: 5n };
    const Q = { x: 11n, y: 10n };
    const order2 = { x: 0n, y: 0n };
    expect(isOnCurve(curve, P) && isOnCurve(curve, Q) && isOnCurve(curve, order2)).toBe(true);

    expect(addWithSteps(curve, null, Q)).toMatchObject({ kind: 'left-identity', result: Q });
    expect(addWithSteps(curve, P, null)).toMatchObject({ kind: 'right-identity', result: P });
    expect(addWithSteps(curve, null, null)).toMatchObject({ kind: 'left-identity', result: null });
    expect(addWithSteps(curve, P, negate(curve, P))).toMatchObject({
      kind: 'inverses',
      result: null,
    });
    expect(addWithSteps(curve, order2, order2)).toMatchObject({
      kind: 'vertical-tangent',
      result: null,
    });
    expect(addWithSteps(curve, P, P).kind).toBe('doubling');
    expect(addWithSteps(curve, P, Q).kind).toBe('chord');
  });
});
