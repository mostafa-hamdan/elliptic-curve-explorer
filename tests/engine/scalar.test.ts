/**
 * Scalar multiplication tests: double-and-add must equal plain repeated addition for
 * every k up to the order of every point, order × P must be O, and each row of the
 * recorded table must be a true statement about the running result.
 */
import { describe, expect, it } from 'vitest';
import {
  add,
  createCurve,
  EccError,
  MAX_SCALAR_BITS,
  multiply,
  multiplyWithSteps,
  negate,
  pointsEqual,
  type Point,
} from '@shared/ecc/index.ts';
import { allPoints, orderByRepeatedAddition, SAMPLE_CURVES } from './helpers.ts';

describe('double-and-add equals repeated addition', () => {
  for (const curve of SAMPLE_CURVES) {
    const name = `E${curve.p}(${curve.a}, ${curve.b})`;

    it(`for every point and every k up to its order on ${name}`, () => {
      const points = allPoints(curve);
      const groupSize = points.length;

      for (const P of points) {
        const { order, multiples } = orderByRepeatedAddition(curve, P);

        // Lagrange: the order of a point divides the number of points.
        expect(groupSize % order, `${name}: order ${order} must divide ${groupSize}`).toBe(0);
        // order × P = O.
        expect(multiply(curve, BigInt(order), P)).toBeNull();
        // 0 × P = O.
        expect(multiply(curve, 0n, P)).toBeNull();

        for (let k = 1; k <= order; k += 1) {
          const expected = multiples[k - 1]!;
          const fast = multiply(curve, BigInt(k), P);
          const traced = multiplyWithSteps(curve, BigInt(k), P);
          if (!pointsEqual(fast, expected) || !pointsEqual(traced.result, expected)) {
            throw new Error(`${name}: ${k}·P is wrong for P = ${JSON.stringify(P, String)}`);
          }
          // Going past the order wraps around: (k + order)·P = k·P.
          if (!pointsEqual(multiply(curve, BigInt(k + order), P), expected)) {
            throw new Error(`${name}: (k + order)·P does not wrap around`);
          }
          // Negative scalars: (−k)·P = −(k·P).
          if (!pointsEqual(multiply(curve, BigInt(-k), P), negate(curve, expected))) {
            throw new Error(`${name}: (−${k})·P is wrong`);
          }
        }
      }
    });
  }
});

describe('the double-and-add table', () => {
  const curve = createCurve(17n, 2n, 2n);
  const P: Point = { x: 5n, y: 1n };

  it('has one row per bit and the rows describe 13P = 1101₂ · P', () => {
    const trace = multiplyWithSteps(curve, 13n, P);
    expect(trace.bits).toBe('1101');
    expect(trace.rows.map((row) => [row.bit, row.operation, row.multiple])).toEqual([
      [1, 'start', 1n],
      [1, 'double-add', 3n],
      [0, 'double', 6n],
      [1, 'double-add', 13n],
    ]);
    expect(trace.doublings).toBe(3);
    expect(trace.additions).toBe(2);
    expect(trace.negated).toBe(false);
  });

  it('every row is true: result = multiple × P, doubled = 2 × before', () => {
    for (const k of [1n, 2n, 3n, 7n, 18n, 19n, 20n, 255n, 1000n, -13n]) {
      const trace = multiplyWithSteps(curve, k, P);
      for (const row of trace.rows) {
        expect(pointsEqual(row.result, multiply(curve, row.multiple, trace.base))).toBe(true);
        if (row.operation === 'start') {
          expect(row.before).toBeNull();
          expect(row.doubled).toBeNull();
        } else {
          expect(pointsEqual(row.doubled, add(curve, row.before, row.before))).toBe(true);
          const expected =
            row.operation === 'double' ? row.doubled : add(curve, row.doubled, trace.base);
          expect(pointsEqual(row.result, expected)).toBe(true);
        }
      }
      expect(trace.rows.at(-1)!.multiple).toBe(trace.magnitude);
      expect(trace.rows).toHaveLength(trace.bits.length);
    }
  });

  it('handles k = 0, the point at infinity and negative k', () => {
    expect(multiplyWithSteps(curve, 0n, P)).toMatchObject({ result: null, rows: [], bits: '' });
    expect(multiplyWithSteps(curve, 5n, null)).toMatchObject({ result: null, rows: [] });
    expect(multiply(curve, 5n, null)).toBeNull();

    const negative = multiplyWithSteps(curve, -5n, P);
    expect(negative.negated).toBe(true);
    expect(negative.magnitude).toBe(5n);
    expect(negative.base).toEqual({ x: 5n, y: 16n });
    expect(negative.result).toEqual({ x: 9n, y: 1n }); // −(9, 16)
  });

  it('accepts a scalar of exactly the maximum size and refuses a larger one', () => {
    const largest = (1n << BigInt(MAX_SCALAR_BITS)) - 1n;
    expect(() => multiply(curve, largest, P)).not.toThrow();
    expect(pointsEqual(multiply(curve, largest, P), multiply(curve, largest % 19n, P))).toBe(true);

    for (const tooBig of [largest + 1n, -(largest + 1n)]) {
      expect(() => multiply(curve, tooBig, P)).toThrow(/k is too large/);
      expect(() => multiplyWithSteps(curve, tooBig, P)).toThrow(EccError);
    }
  });

  it('refuses a point that is not on the curve', () => {
    expect(() => multiply(curve, 3n, { x: 5n, y: 2n })).toThrow(/not a point on E17\(2, 2\)/);
    expect(() => multiplyWithSteps(curve, 3n, { x: 5n, y: 2n })).toThrow(EccError);
  });
});
