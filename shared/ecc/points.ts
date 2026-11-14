/**
 * Finding every point on a curve, and checking the count against Hasse's theorem.
 * The listing walks x = 0 … p − 1 and takes one square root mod p per x, which costs
 * about p steps. Testing every (x, y) pair would cost p² steps.
 */
import { rightHandSide, type Curve } from './curve.ts';
import { EccError } from './errors.ts';
import { isqrt, legendreSymbol, sqrtMod } from './modular.ts';
import type { AffinePoint } from './point.ts';

/**
 * Largest p for which the app lists every point.
 *
 * Measured on a mid-range laptop: listing takes about 1 to 1.5 seconds at this size,
 * inside the 2 second target. Adding and multiplying have no such limit.
 */
export const LIST_POINTS_MAX_P = 200_000n;

/**
 * Called from time to time while listing, so a screen can draw a progress bar.
 *
 * @param done - how many x values have been handled so far.
 * @param total - how many there are in all (p).
 */
export type ListProgress = (done: number, total: number) => void;

/**
 * List every ordinary point of the curve, in order of x and then y.
 * The point at infinity O is always on the curve too; it is not in the list because it
 * has no coordinates, so the group has `result.length + 1` points.
 *
 * Method, for each x from 0 to p − 1:
 *   1. Compute r = x³ + ax + b mod p.
 *   2. If r = 0 there is exactly one point, (x, 0).
 *   3. Otherwise Euler's criterion r^((p−1)/2) says whether r is a square. If it is,
 *      Tonelli-Shanks gives a root y, and the two points are (x, y) and (x, p − y).
 *
 * @param curve - a validated curve with p ≤ {@link LIST_POINTS_MAX_P}.
 * @param onProgress - optional progress callback, called about 100 times.
 * @returns all ordinary points, sorted by x and then y.
 * @throws EccError('LIST_LIMIT') when p is above the limit.
 */
export function listPoints(curve: Curve, onProgress?: ListProgress): AffinePoint[] {
  const { p } = curve;
  if (p > LIST_POINTS_MAX_P) {
    throw new EccError(
      'LIST_LIMIT',
      `Listing every point is limited to p ≤ ${LIST_POINTS_MAX_P}. This curve has about ${p} points, far too many to list. Adding and multiplying still work.`,
    );
  }

  const total = Number(p);
  const reportEvery = Math.max(1, Math.floor(total / 100));
  const points: AffinePoint[] = [];

  let x = 0n;
  for (let done = 0; done < total; done += 1, x += 1n) {
    const rhs = rightHandSide(curve, x);
    if (rhs === 0n) {
      points.push({ x, y: 0n });
    } else if (legendreSymbol(rhs, p) === 1) {
      // sqrtMod returns the smaller root, so (x, y) comes before (x, p − y).
      const y = sqrtMod(rhs, p);
      if (y !== null) {
        points.push({ x, y }, { x, y: p - y });
      }
    }
    if (onProgress && (done + 1) % reportEvery === 0) {
      onProgress(done + 1, total);
    }
  }

  onProgress?.(total, total);
  return points;
}

/** The result of comparing a point count with Hasse's theorem. */
export interface HasseCheck {
  /** The prime p. */
  p: bigint;
  /** N, the number of points including O. */
  count: bigint;
  /** ⌊2√p⌋, the largest whole distance N may be from p + 1. */
  width: bigint;
  /** Smallest allowed count: p + 1 − ⌊2√p⌋. */
  lower: bigint;
  /** Largest allowed count: p + 1 + ⌊2√p⌋. */
  upper: bigint;
  /** p + 1 − N, called the trace of Frobenius. Hasse says |trace| ≤ 2√p. */
  trace: bigint;
  /** True when lower ≤ N ≤ upper. */
  within: boolean;
}

/**
 * Check a point count against Hasse's theorem.
 *
 * Formula: |N − (p + 1)| ≤ 2√p, where N counts O as well. Squaring both sides gives the
 * exact whole-number test (N − p − 1)² ≤ 4p, so no rounding is involved.
 *
 * @param p - the prime of the curve.
 * @param count - N, the number of points including O.
 * @returns the bounds and whether the count lies inside them.
 */
export function hasseCheck(p: bigint, count: bigint): HasseCheck {
  const width = isqrt(4n * p);
  const trace = p + 1n - count;
  return {
    p,
    count,
    width,
    lower: p + 1n - width,
    upper: p + 1n + width,
    trace,
    within: trace * trace <= 4n * p,
  };
}
