/**
 * Real 256-bit curves: results on secp256k1 and NIST P-256 must match an independent,
 * widely used library (noble-curves). The library is a test-only dependency; the app
 * itself never uses it.
 */
import { p256 } from '@noble/curves/nist.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  add,
  addWithSteps,
  createCurve,
  findPreset,
  hasseCheck,
  isOnCurve,
  makePoint,
  multiply,
  multiplyWithSteps,
  negate,
  parseInteger,
  type AffinePoint,
  type Curve,
  type Point,
} from '@shared/ecc/index.ts';

/** The part of the reference library's point class that these tests use. */
interface ReferencePoint {
  multiply(scalar: bigint): ReferencePoint;
  add(other: ReferencePoint): ReferencePoint;
  double(): ReferencePoint;
  toAffine(): { x: bigint; y: bigint };
}

interface RealCurveCase {
  name: string;
  curve: Curve;
  /** Base point G from our presets. */
  G: AffinePoint;
  /** Order of G (a published constant of the curve). */
  n: bigint;
  /** Base point of the reference library. */
  reference: ReferencePoint;
}

/** Build a test case from one of our presets plus the reference library's base point. */
function loadCase(presetId: string, n: bigint, reference: ReferencePoint): RealCurveCase {
  const preset = findPreset(presetId)!;
  const curve = createCurve(
    parseInteger(preset.p, 'p'),
    parseInteger(preset.a, 'a'),
    parseInteger(preset.b, 'b'),
  );
  const G = makePoint(
    curve,
    parseInteger(preset.pointP[0], 'x'),
    parseInteger(preset.pointP[1], 'y'),
  );
  return { name: preset.label, curve, G, n, reference };
}

const CASES: RealCurveCase[] = [
  loadCase(
    'secp256k1',
    0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,
    secp256k1.Point.BASE,
  ),
  loadCase(
    'p256',
    0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n,
    p256.Point.BASE,
  ),
];

/** Convert a reference-library point to our shape. */
function fromReference(point: ReferencePoint): Point {
  const { x, y } = point.toAffine();
  return { x, y };
}

for (const { name, curve, G, n, reference } of CASES) {
  describe(name, () => {
    it('has the published parameters and base point', () => {
      expect(fromReference(reference)).toEqual(G);
      expect(isOnCurve(curve, G)).toBe(true);
    });

    it('n · G = O and (n − 1) · G = −G', () => {
      expect(multiply(curve, n, G)).toBeNull();
      expect(multiply(curve, n - 1n, G)).toEqual(negate(curve, G));
      expect(multiply(curve, n + 1n, G)).toEqual(G);
      expect(hasseCheck(curve.p, n).within).toBe(true);
    });

    it('small multiples match the reference library', () => {
      for (const k of [1n, 2n, 3n, 4n, 5n, 7n, 16n, 255n, 65537n, 123456n]) {
        expect(multiply(curve, k, G), `${k}G`).toEqual(fromReference(reference.multiply(k)));
      }
    });

    it('random scalars match the reference library, with and without steps', () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 1n, max: n - 1n }), (k) => {
          const expected = fromReference(reference.multiply(k));
          expect(multiply(curve, k, G)).toEqual(expected);
          expect(multiplyWithSteps(curve, k, G).result).toEqual(expected);
        }),
        { numRuns: 40 },
      );
    });

    it('random additions and doublings match the reference library', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 1n, max: n - 1n }),
          fc.bigInt({ min: 1n, max: n - 1n }),
          (j, k) => {
            fc.pre(j !== k && j + k !== n);
            const refP = reference.multiply(j);
            const refQ = reference.multiply(k);
            const P = fromReference(refP);
            const Q = fromReference(refQ);

            const sum = fromReference(refP.add(refQ));
            expect(add(curve, P, Q)).toEqual(sum);
            expect(addWithSteps(curve, P, Q).result).toEqual(sum);

            const doubled = fromReference(refP.double());
            expect(add(curve, P, P)).toEqual(doubled);
            expect(addWithSteps(curve, P, P).result).toEqual(doubled);

            // jG + kG must equal (j + k)G: ties addition to multiplication.
            expect(multiply(curve, j + k, G)).toEqual(sum);
          },
        ),
        { numRuns: 25 },
      );
    });

    it('is associative on random multiples of G', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.bigInt({ min: 1n, max: n - 1n }),
            fc.bigInt({ min: 1n, max: n - 1n }),
            fc.bigInt({ min: 1n, max: n - 1n }),
          ),
          ([i, j, k]) => {
            const P = multiply(curve, i, G);
            const Q = multiply(curve, j, G);
            const R = multiply(curve, k, G);
            expect(add(curve, add(curve, P, Q), R)).toEqual(add(curve, P, add(curve, Q, R)));
          },
        ),
        { numRuns: 10 },
      );
    });
  });
}
