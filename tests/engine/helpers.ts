/**
 * Small helpers shared by the engine tests.
 * They are written in the most obvious way possible (plain loops, no clever maths) so
 * that they can act as an independent check on the engine.
 */
import { add, createCurve, listPoints, type Curve, type Point } from '@shared/ecc/index.ts';

/** The small primes the specification asks the exhaustive tests to cover. */
export const SPEC_PRIMES = [5, 7, 11, 13, 17, 23, 97] as const;

/** A few hand-picked curves used by the group-law and scalar tests. */
export const SAMPLE_CURVES: readonly Curve[] = [
  createCurve(23n, 1n, 1n), // the classroom curve, 28 points
  createCurve(17n, 2n, 2n), // 19 points, cyclic of prime order
  createCurve(11n, 1n, 6n), // 13 points
  createCurve(23n, 1n, 0n), // has points with y = 0 (order 2)
  createCurve(13n, 0n, 7n), // a = 0, the same shape as secp256k1
  createCurve(97n, 2n, 3n), // 100 points
];

/**
 * Tell whether y² = x³ + ax + b is singular over p, using ordinary numbers.
 *
 * @param p - a small prime.
 * @param a - coefficient a in 0 … p − 1.
 * @param b - coefficient b in 0 … p − 1.
 * @returns true when 4a³ + 27b² ≡ 0 (mod p).
 */
export function isSingularNaive(p: number, a: number, b: number): boolean {
  return (4 * a * a * a + 27 * b * b) % p === 0;
}

/**
 * Find every point by trying every (x, y) pair: the slow method the engine must agree
 * with. Points are encoded as x·p + y so two lists can be compared cheaply.
 *
 * @param p - a small prime.
 * @param a - coefficient a in 0 … p − 1.
 * @param b - coefficient b in 0 … p − 1.
 * @returns the encoded points in order of x and then y (O is not included).
 */
export function exhaustivePoints(p: number, a: number, b: number): number[] {
  const found: number[] = [];
  for (let x = 0; x < p; x += 1) {
    const rhs = (((x * x) % p) * x + a * x + b) % p;
    for (let y = 0; y < p; y += 1) {
      if ((y * y) % p === rhs) found.push(x * p + y);
    }
  }
  return found;
}

/**
 * All points of a curve including the point at infinity.
 *
 * @param curve - a validated curve small enough to list.
 * @returns O followed by every ordinary point.
 */
export function allPoints(curve: Curve): Point[] {
  return [null, ...listPoints(curve)];
}

/**
 * Order of a point found the slow way: keep adding P until the sum is O.
 *
 * @param curve - a validated curve.
 * @param point - a point on it.
 * @returns the smallest n ≥ 1 with nP = O, and the list [1P, 2P, …, nP].
 */
export function orderByRepeatedAddition(
  curve: Curve,
  point: Point,
): { order: number; multiples: Point[] } {
  const multiples: Point[] = [point];
  let running = point;
  while (running !== null) {
    running = add(curve, running, point);
    multiples.push(running);
  }
  return { order: multiples.length, multiples };
}
