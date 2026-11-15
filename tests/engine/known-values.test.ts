/**
 * Known answers that were verified by hand in class. If any of these change, the engine
 * is wrong, whatever the other tests say.
 */
import { describe, expect, it } from 'vitest';
import {
  addWithSteps,
  createCurve,
  curveName,
  listPoints,
  multiply,
  multiplyWithSteps,
  singularityValue,
} from '@shared/ecc/index.ts';

describe('E23(1, 1)', () => {
  const curve = createCurve(23n, 1n, 1n);

  it('(3, 10) + (9, 7) = (17, 20), with the hand-method numbers', () => {
    const trace = addWithSteps(curve, { x: 3n, y: 10n }, { x: 9n, y: 7n });
    expect(trace.kind).toBe('chord');
    expect(trace.result).toEqual({ x: 17n, y: 20n });
    // λ = (7 − 10)/(9 − 3) = −3/6 ≡ 20 · 6⁻¹ = 20 · 4 = 80 ≡ 11 (mod 23)
    expect(trace.slope).toMatchObject({
      numeratorRaw: -3n,
      numerator: 20n,
      denominatorRaw: 6n,
      denominator: 6n,
      product: 80n,
      lambda: 11n,
    });
    expect(trace.slope!.inverse.inverse).toBe(4n);
    // x₃ = 11² − 3 − 9 = 109 ≡ 17, y₃ = 11(3 − 17) − 10 = −164 ≡ 20
    expect(trace.x3Raw).toBe(109n);
    expect(trace.y3Raw).toBe(-164n);
  });

  it('2(3, 10) = (7, 12), with the hand-method numbers', () => {
    const trace = addWithSteps(curve, { x: 3n, y: 10n }, { x: 3n, y: 10n });
    expect(trace.kind).toBe('doubling');
    expect(trace.result).toEqual({ x: 7n, y: 12n });
    // λ = (3·3² + 1)/(2·10) = 28/20 ≡ 5 · 20⁻¹ = 5 · 15 = 75 ≡ 6 (mod 23)
    expect(trace.slope).toMatchObject({
      numeratorRaw: 28n,
      numerator: 5n,
      denominatorRaw: 20n,
      denominator: 20n,
      lambda: 6n,
    });
    expect(trace.slope!.inverse.inverse).toBe(15n);
    expect(multiply(curve, 2n, { x: 3n, y: 10n })).toEqual({ x: 7n, y: 12n });
  });

  it('has 28 points including O', () => {
    expect(listPoints(curve).length + 1).toBe(28);
  });
});

describe('E17(2, 2) with P = (5, 1)', () => {
  const curve = createCurve(17n, 2n, 2n);
  const P = { x: 5n, y: 1n };

  it('2P, 3P, 4P and 5P match the class values', () => {
    expect(multiply(curve, 2n, P)).toEqual({ x: 6n, y: 3n });
    expect(multiply(curve, 3n, P)).toEqual({ x: 10n, y: 6n });
    expect(multiply(curve, 4n, P)).toEqual({ x: 3n, y: 1n });
    expect(multiply(curve, 5n, P)).toEqual({ x: 9n, y: 16n });
  });

  it('has 19 points including O', () => {
    expect(listPoints(curve).length + 1).toBe(19);
  });

  it('19P = O and 18P = −P', () => {
    expect(multiply(curve, 19n, P)).toBeNull();
    expect(multiplyWithSteps(curve, 19n, P).result).toBeNull();
    expect(multiply(curve, 18n, P)).toEqual({ x: 5n, y: 16n });
  });
});

describe('curve setup', () => {
  it('reduces a and b mod p', () => {
    expect(createCurve(23n, 24n, -22n)).toEqual({ p: 23n, a: 1n, b: 1n });
    expect(curveName(createCurve(751n, -1n, 188n))).toBe('E751(750, 188)');
  });

  it('computes 4a³ + 27b² mod p', () => {
    expect(singularityValue(23n, 1n, 1n)).toBe(8n); // 31 mod 23
    expect(singularityValue(17n, 2n, 2n)).toBe(4n); // 140 mod 17
    expect(singularityValue(23n, 0n, 0n)).toBe(0n);
  });
});
