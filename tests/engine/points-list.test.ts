/**
 * The exhaustive check from the specification: for the primes 5, 7, 11, 13, 17, 23 and 97
 * and EVERY choice of (a, b), the engine's point list must equal a brute-force search
 * over all (x, y) pairs, the singular curves must be rejected, and every point count
 * must sit inside the Hasse bound.
 */
import { describe, expect, it } from 'vitest';
import {
  createCurve,
  EccError,
  hasseCheck,
  LIST_POINTS_MAX_P,
  listPoints,
} from '@shared/ecc/index.ts';
import { exhaustivePoints, isSingularNaive, SPEC_PRIMES } from './helpers.ts';

describe('point listing against exhaustive search', () => {
  for (const p of SPEC_PRIMES) {
    it(`matches brute force for every curve over p = ${p}`, () => {
      const prime = BigInt(p);
      let curvesChecked = 0;
      let singularRejected = 0;

      for (let a = 0; a < p; a += 1) {
        for (let b = 0; b < p; b += 1) {
          if (isSingularNaive(p, a, b)) {
            // A singular curve must be refused, with the right reason.
            let code = '';
            try {
              createCurve(prime, BigInt(a), BigInt(b));
            } catch (error) {
              code = error instanceof EccError ? error.code : 'other';
            }
            if (code !== 'SINGULAR') {
              throw new Error(`E${p}(${a}, ${b}) is singular but was not rejected (${code})`);
            }
            singularRejected += 1;
            continue;
          }

          const curve = createCurve(prime, BigInt(a), BigInt(b));
          const expected = exhaustivePoints(p, a, b);
          const actual = listPoints(curve).map((point) => Number(point.x) * p + Number(point.y));

          if (actual.length !== expected.length || actual.some((v, i) => v !== expected[i])) {
            throw new Error(
              `E${p}(${a}, ${b}): engine found ${actual.length} points, brute force ${expected.length}`,
            );
          }

          // Hasse: |N − (p + 1)| ≤ 2√p, with N counting O as well.
          const check = hasseCheck(prime, BigInt(actual.length + 1));
          if (!check.within) {
            throw new Error(`E${p}(${a}, ${b}): ${actual.length + 1} points breaks Hasse`);
          }
          curvesChecked += 1;
        }
      }

      // Over a prime p > 3 exactly p of the p² pairs (a, b) are singular.
      expect(singularRejected).toBe(p);
      expect(curvesChecked).toBe(p * p - p);
    });
  }
});

describe('listPoints details', () => {
  it('lists E17(2, 2) in order of x then y, 18 points plus O', () => {
    const points = listPoints(createCurve(17n, 2n, 2n));
    expect(points).toHaveLength(18);
    expect(points.map((point) => `${point.x},${point.y}`)).toEqual([
      '0,6',
      '0,11',
      '3,1',
      '3,16',
      '5,1',
      '5,16',
      '6,3',
      '6,14',
      '7,6',
      '7,11',
      '9,1',
      '9,16',
      '10,6',
      '10,11',
      '13,7',
      '13,10',
      '16,4',
      '16,13',
    ]);
  });

  it('gives one point, not two, where y = 0', () => {
    // On E23(1, 0), x = 0 gives y² = 0, so (0, 0) appears exactly once.
    const points = listPoints(createCurve(23n, 1n, 0n));
    expect(points.filter((point) => point.x === 0n)).toEqual([{ x: 0n, y: 0n }]);
  });

  it('counts 28 points on E23(1, 1) and 727 on E751(−1, 188)', () => {
    expect(listPoints(createCurve(23n, 1n, 1n)).length + 1).toBe(28);
    expect(listPoints(createCurve(751n, -1n, 188n)).length + 1).toBe(727);
  });

  it('reports progress from 0 up to p and finishes at exactly p', () => {
    const calls: Array<[number, number]> = [];
    listPoints(createCurve(751n, -1n, 188n), (done, total) => calls.push([done, total]));
    expect(calls.length).toBeGreaterThan(50);
    expect(calls.at(-1)).toEqual([751, 751]);
    // Progress never goes backwards.
    expect(calls.every(([done], i) => i === 0 || done >= calls[i - 1]![0])).toBe(true);
  });

  it('refuses to list a curve above the limit, with a clear reason', () => {
    const big = createCurve(200_003n, 2n, 3n);
    expect(big.p > LIST_POINTS_MAX_P).toBe(true);
    expect(() => listPoints(big)).toThrow(/limited to p ≤ 200000/);
    try {
      listPoints(big);
    } catch (error) {
      expect((error as EccError).code).toBe('LIST_LIMIT');
    }
  });

  it('lists the largest allowed prime and stays inside the Hasse bound', () => {
    const p = 199_999n; // the largest prime below the limit
    const count = BigInt(listPoints(createCurve(p, 2n, 3n)).length + 1);
    expect(hasseCheck(p, count).within).toBe(true);
  });
});

describe('hasseCheck', () => {
  it('gives the bounds for p = 23', () => {
    // 2√23 ≈ 9.59, so 24 − 9 ≤ N ≤ 24 + 9.
    expect(hasseCheck(23n, 28n)).toEqual({
      p: 23n,
      count: 28n,
      width: 9n,
      lower: 15n,
      upper: 33n,
      trace: -4n,
      within: true,
    });
  });

  it('flags counts outside the bound', () => {
    expect(hasseCheck(23n, 14n).within).toBe(false);
    expect(hasseCheck(23n, 34n).within).toBe(false);
    expect(hasseCheck(23n, 15n).within).toBe(true);
    expect(hasseCheck(23n, 33n).within).toBe(true);
  });

  it('accepts the real group order of secp256k1', () => {
    const p = 2n ** 256n - 2n ** 32n - 977n;
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    expect(hasseCheck(p, n).within).toBe(true);
  });
});
