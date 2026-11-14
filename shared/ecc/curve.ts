/**
 * The curve Ep(a, b): y² ≡ x³ + ax + b (mod p).
 * This file checks that p, a and b really describe an elliptic curve and answers the
 * basic question "is this (x, y) on the curve?". Point arithmetic lives in `point.ts`.
 */
import { EccError } from './errors.ts';
import { bitLength, findSmallFactor, isPrime, mod } from './modular.ts';

/** Largest prime (in bits) the engine accepts. Real curves in use today are 256 to 521 bits. */
export const MAX_FIELD_BITS = 1024;

/** A validated curve. Create one with {@link createCurve}, never by hand. */
export interface Curve {
  /** The prime modulus, p > 3. */
  readonly p: bigint;
  /** Coefficient a, reduced into 0 … p − 1. */
  readonly a: bigint;
  /** Coefficient b, reduced into 0 … p − 1. */
  readonly b: bigint;
}

/**
 * The value that decides whether the curve is singular.
 *
 * Formula: (4a³ + 27b²) mod p. When it is 0 the cubic x³ + ax + b has a repeated root,
 * the curve has a cusp or crosses itself, and point addition stops being a group law.
 *
 * @param p - the modulus (positive).
 * @param a - coefficient a (any integer).
 * @param b - coefficient b (any integer).
 * @returns (4a³ + 27b²) mod p.
 */
export function singularityValue(p: bigint, a: bigint, b: bigint): bigint {
  const aReduced = mod(a, p);
  const bReduced = mod(b, p);
  return mod(4n * aReduced ** 3n + 27n * bReduced ** 2n, p);
}

/**
 * Check p on its own and explain what is wrong with it, if anything.
 *
 * @param p - the proposed modulus.
 * @throws EccError('NOT_PRIME') when p is below 2 or composite.
 * @throws EccError('PRIME_TOO_SMALL') when p is 2 or 3.
 * @throws EccError('TOO_LARGE') when p has more than {@link MAX_FIELD_BITS} bits.
 */
export function assertValidModulus(p: bigint): void {
  if (p < 2n) {
    throw new EccError('NOT_PRIME', `p must be a prime number greater than 3, but p = ${p}.`);
  }
  if (bitLength(p) > MAX_FIELD_BITS) {
    throw new EccError(
      'TOO_LARGE',
      `p is too large: this app accepts primes of up to ${MAX_FIELD_BITS} bits.`,
    );
  }
  if (!isPrime(p)) {
    const factor = findSmallFactor(p);
    const detail = factor === null ? '' : ` (${p} = ${factor} × ${p / factor})`;
    throw new EccError('NOT_PRIME', `p must be prime, but ${p} is not${detail}.`);
  }
  if (p <= 3n) {
    throw new EccError(
      'PRIME_TOO_SMALL',
      `p must be a prime greater than 3. For p = ${p} the form y² = x³ + ax + b does not describe elliptic curves.`,
    );
  }
}

/**
 * Validate p, a, b and build the curve Ep(a, b).
 *
 * a and b are reduced mod p first, so E23(24, −22) becomes E23(1, 1).
 *
 * @param p - the modulus; must be a prime greater than 3.
 * @param a - coefficient a (any integer).
 * @param b - coefficient b (any integer).
 * @returns the validated curve with a and b reduced.
 * @throws EccError('NOT_PRIME' | 'PRIME_TOO_SMALL' | 'TOO_LARGE') for a bad p.
 * @throws EccError('SINGULAR') when 4a³ + 27b² ≡ 0 (mod p).
 */
export function createCurve(p: bigint, a: bigint, b: bigint): Curve {
  assertValidModulus(p);
  const curve: Curve = { p, a: mod(a, p), b: mod(b, p) };
  if (singularityValue(p, curve.a, curve.b) === 0n) {
    throw new EccError(
      'SINGULAR',
      `This curve is singular: 4a³ + 27b² ≡ 0 (mod ${p}). Its points do not form a group, so choose a different a or b.`,
    );
  }
  return curve;
}

/**
 * Right-hand side of the curve equation for one x.
 *
 * Formula: (x³ + ax + b) mod p.
 *
 * @param curve - a validated curve.
 * @param x - any integer.
 * @returns the value in 0 … p − 1.
 */
export function rightHandSide(curve: Curve, x: bigint): bigint {
  const xReduced = mod(x, curve.p);
  return mod(xReduced * xReduced * xReduced + curve.a * xReduced + curve.b, curve.p);
}

/**
 * Both sides of the curve equation for a candidate point, so a screen can show why a
 * point is or is not on the curve.
 *
 * Formula: left = y² mod p, right = (x³ + ax + b) mod p. The point is on the curve
 * exactly when left = right.
 *
 * @param curve - a validated curve.
 * @param x - candidate x (any integer).
 * @param y - candidate y (any integer).
 * @returns the two sides, each in 0 … p − 1.
 */
export function curveSides(curve: Curve, x: bigint, y: bigint): { left: bigint; right: bigint } {
  const yReduced = mod(y, curve.p);
  return { left: mod(yReduced * yReduced, curve.p), right: rightHandSide(curve, x) };
}

/**
 * Short name of a curve in the course notation.
 *
 * @param curve - a validated curve.
 * @returns for example "E23(1, 1)".
 */
export function curveName(curve: Curve): string {
  return `E${curve.p}(${curve.a}, ${curve.b})`;
}
