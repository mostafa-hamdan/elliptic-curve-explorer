/**
 * Tests for the math behind the pictures: the real-number curve and its chord rule, the
 * plot's zoom limits and tick spacing, and the list of multiples used by the animation.
 */
import { describe, expect, it } from 'vitest';
import { createCurve, multiply } from '@shared/ecc/index.ts';
import {
  bisectRoot,
  curvePieces,
  isSingularReal,
  pointNear,
  realAdd,
  rhs,
} from '../../client/src/features/learn/realCurve.ts';
import {
  MAX_MULTIPLES,
  multiplesOf,
} from '../../client/src/features/multiply/MultiplesAnimation.tsx';
import { clampView, tickStep } from '../../client/src/features/points/PointsPlot.tsx';

describe('real-number curve', () => {
  it('evaluates the right-hand side and spots singular curves', () => {
    expect(rhs(-1, 1, 2)).toBe(7);
    expect(isSingularReal(-3, 2)).toBe(true);
    expect(isSingularReal(0, 0)).toBe(true);
    expect(isSingularReal(-1, 1)).toBe(false);
  });

  it('finds the root of the cubic precisely', () => {
    // y² = x³ − x + 1 crosses y = 0 near x = −1.3247 (the plastic number, negated).
    const root = bisectRoot(-1, 1, -2, -1);
    expect(rhs(-1, 1, root)).toBeCloseTo(0, 9);
    expect(root).toBeCloseTo(-1.324718, 5);
  });

  it('draws one closed piece for y² = x³ − x + 1 and two for y² = x³ − 2x', () => {
    expect(curvePieces(-1, 1, -3, 3.5)).toHaveLength(1);
    // x³ − 2x has three real roots, so the curve has an oval and an open branch.
    expect(curvePieces(-2, 0, -3, 3.5)).toHaveLength(2);
    for (const piece of curvePieces(-2, 0, -3, 3.5)) {
      for (const [x, y] of piece) expect(y * y).toBeCloseTo(Math.max(0, rhs(-2, 0, x)), 6);
    }
  });

  it('adds points with the chord rule and agrees with the formulas', () => {
    const P = { x: -1, y: 1 };
    const Q = { x: 0, y: 1 };
    const { sum, lambda, third } = realAdd(-1, P, Q);
    expect(lambda).toBe(0);
    // λ = 0: x₃ = 0 − (−1) − 0 = 1, y₃ = 0 − 1 = −1.
    expect(sum).toEqual({ x: 1, y: -1 });
    expect(third).toEqual({ x: 1, y: 1 });
    // The answer lies on the curve.
    expect(sum!.y ** 2).toBeCloseTo(rhs(-1, 1, sum!.x), 9);
  });

  it('gives O for a vertical line, and handles O as the identity', () => {
    expect(realAdd(-1, { x: 0, y: 1 }, { x: 0, y: -1 }).sum).toBeNull();
    expect(realAdd(-1, null, { x: 0, y: 1 }).sum).toEqual({ x: 0, y: 1 });
    expect(realAdd(-1, { x: 0, y: 1 }, null).sum).toEqual({ x: 0, y: 1 });
  });

  it('doubles with the tangent rule', () => {
    const P = { x: 0, y: 1 };
    const { sum, lambda } = realAdd(-1, P, P);
    expect(lambda).toBeCloseTo(-0.5, 9);
    expect(sum!.y ** 2).toBeCloseTo(rhs(-1, 1, sum!.x), 9);
  });

  it('moves a point to where the curve exists', () => {
    // y² = x³ − 2x has no points for 0 < x < √2.
    const point = pointNear(-2, 0, 0.8, true, -3, 3.5);
    expect(point).not.toBeNull();
    expect(rhs(-2, 0, point!.x)).toBeGreaterThanOrEqual(0);
    expect(pointNear(-1, 1, 1, false, -3, 3.5)!.y).toBeLessThan(0);
  });
});

describe('plot view', () => {
  it('chooses round tick steps', () => {
    expect(tickStep(23)).toBe(5);
    expect(tickStep(97)).toBe(20);
    expect(tickStep(751)).toBe(200);
    expect(tickStep(4)).toBe(1);
  });

  it('keeps the view inside the field', () => {
    expect(clampView({ x0: -5, y0: 30, span: 10 }, 23)).toEqual({ x0: 0, y0: 13, span: 10 });
    expect(clampView({ x0: 0, y0: 0, span: 2 }, 23)).toEqual({ x0: 0, y0: 0, span: 8 });
    expect(clampView({ x0: 0, y0: 0, span: 1000 }, 23)).toEqual({ x0: 0, y0: 0, span: 23 });
    // A field smaller than the minimum zoom shows the whole field.
    expect(clampView({ x0: 0, y0: 0, span: 1 }, 5)).toEqual({ x0: 0, y0: 0, span: 5 });
  });
});

describe('multiples of a point', () => {
  const E17 = createCurve(17n, 2n, 2n);

  it('walks P, 2P, … until O; the length is the order', () => {
    const { multiples, reachedInfinity } = multiplesOf(E17, { x: 5n, y: 1n });
    expect(reachedInfinity).toBe(true);
    expect(multiples).toHaveLength(19);
    expect(multiples[1]).toEqual({ x: 6n, y: 3n });
    expect(multiples[18]).toBeNull();
    multiples.forEach((value, index) => {
      expect(value).toEqual(multiply(E17, BigInt(index + 1), { x: 5n, y: 1n }));
    });
  });

  it('stops at the limit on a huge curve and says O was not reached', () => {
    const secp = createCurve(2n ** 256n - 2n ** 32n - 977n, 0n, 7n);
    const G = {
      x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
      y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
    };
    const { multiples, reachedInfinity } = multiplesOf(secp, G);
    expect(multiples).toHaveLength(MAX_MULTIPLES);
    expect(reachedInfinity).toBe(false);
  });

  it('gives order 1 for O itself', () => {
    expect(multiplesOf(E17, null)).toEqual({ multiples: [null], reachedInfinity: true });
  });
});
