/**
 * Points on Ep(a, b) and the group operations: negate, add, double and multiply by a
 * scalar. Each operation exists twice: a fast version that returns only the answer, and
 * a "with steps" version that also returns every intermediate number, so a screen can
 * show the working exactly as it is done by hand.
 */
import { curveName, curveSides, type Curve } from './curve.ts';
import { EccError } from './errors.ts';
import { bitLength, inverseTrace, mod, modInverse, type InverseTrace } from './modular.ts';

/** Largest scalar (in bits) accepted for kP. 1024 bits is about 309 decimal digits. */
export const MAX_SCALAR_BITS = 1024;

/** An ordinary point with coordinates in 0 … p − 1. */
export interface AffinePoint {
  readonly x: bigint;
  readonly y: bigint;
}

/**
 * A point of the group: an ordinary point, or `null` for the point at infinity O.
 * O is the identity of the group (P + O = P) and has no coordinates, which is why it is
 * modeled as "no point" rather than as a special pair of numbers.
 */
export type Point = AffinePoint | null;

/** The point at infinity O, the identity element. */
export const INFINITY: Point = null;

/**
 * @param point - any point.
 * @returns true when the point is O.
 */
export function isInfinity(point: Point): point is null {
  return point === null;
}

/**
 * @param first - any point.
 * @param second - any point.
 * @returns true when both are O, or both have the same x and y.
 */
export function pointsEqual(first: Point, second: Point): boolean {
  if (first === null || second === null) return first === second;
  return first.x === second.x && first.y === second.y;
}

/**
 * Write a point the way the course does.
 *
 * @param point - any point.
 * @returns "O" for the point at infinity, otherwise "(x, y)".
 */
export function formatPoint(point: Point): string {
  return point === null ? 'O' : `(${point.x}, ${point.y})`;
}

/**
 * Build a point from user-supplied coordinates, refusing anything not on the curve.
 *
 * The coordinates are reduced mod p first, so (26, 10) on E23(1, 1) becomes (3, 10).
 *
 * @param curve - a validated curve.
 * @param x - x coordinate (any integer).
 * @param y - y coordinate (any integer).
 * @returns the point with reduced coordinates.
 * @throws EccError('NOT_ON_CURVE') with both sides of the equation in the message.
 */
export function makePoint(curve: Curve, x: bigint, y: bigint): AffinePoint {
  const point: AffinePoint = { x: mod(x, curve.p), y: mod(y, curve.p) };
  const { left, right } = curveSides(curve, point.x, point.y);
  if (left !== right) {
    throw new EccError(
      'NOT_ON_CURVE',
      `${formatPoint(point)} is not on ${curveName(curve)}: y² mod p = ${left}, but x³ + ax + b mod p = ${right}.`,
    );
  }
  return point;
}

/**
 * @param curve - a validated curve.
 * @param point - any point.
 * @returns true for O and for every (x, y) with 0 ≤ x, y < p that satisfies the equation.
 */
export function isOnCurve(curve: Curve, point: Point): boolean {
  if (point === null) return true;
  if (point.x < 0n || point.x >= curve.p || point.y < 0n || point.y >= curve.p) return false;
  const { left, right } = curveSides(curve, point.x, point.y);
  return left === right;
}

/**
 * Make sure a point given to a public operation really is on the curve.
 * The addition formulas silently give nonsense for other inputs, so we stop early.
 *
 * @param curve - a validated curve.
 * @param point - the point to check.
 * @param label - name used in the message, for example "P".
 * @throws EccError('NOT_ON_CURVE') when the point is not on the curve.
 */
function assertOnCurve(curve: Curve, point: Point, label: string): void {
  if (!isOnCurve(curve, point)) {
    throw new EccError(
      'NOT_ON_CURVE',
      `${label} = ${formatPoint(point)} is not a point on ${curveName(curve)}.`,
    );
  }
}

/**
 * The inverse of a point: its mirror image.
 *
 * Formula: −(x, y) = (x, −y mod p), and −O = O. A point and its inverse add up to O.
 *
 * @param curve - a validated curve.
 * @param point - any point on the curve.
 * @returns −point.
 */
export function negate(curve: Curve, point: Point): Point {
  if (point === null) return null;
  return { x: point.x, y: mod(-point.y, curve.p) };
}

/**
 * Add two points (fast version, no steps). Both points must already be on the curve.
 *
 * Formulas (all mod p):
 *   - P + O = P and O + Q = Q.
 *   - If x₁ = x₂ and y₁ + y₂ ≡ 0 the line through them is vertical: the sum is O.
 *     This covers Q = −P and also doubling a point whose y is 0.
 *   - Otherwise λ = (y₂ − y₁)/(x₂ − x₁) for different points,
 *               λ = (3x₁² + a)/(2y₁) for P = Q,
 *     then x₃ = λ² − x₁ − x₂ and y₃ = λ(x₁ − x₃) − y₁.
 *
 * @param curve - a validated curve.
 * @param p - first point, on the curve.
 * @param q - second point, on the curve.
 * @returns p + q.
 */
export function add(curve: Curve, p: Point, q: Point): Point {
  if (p === null) return q;
  if (q === null) return p;
  const prime = curve.p;

  let lambda: bigint;
  if (p.x === q.x) {
    // Same x means the points are equal or mirror images of each other.
    if (mod(p.y + q.y, prime) === 0n) return null;
    lambda = mod((3n * p.x * p.x + curve.a) * modInverse(2n * p.y, prime), prime);
  } else {
    lambda = mod((q.y - p.y) * modInverse(q.x - p.x, prime), prime);
  }

  const x3 = mod(lambda * lambda - p.x - q.x, prime);
  const y3 = mod(lambda * (p.x - x3) - p.y, prime);
  return { x: x3, y: y3 };
}

/**
 * Double a point (fast version).
 *
 * Formula: 2P = P + P, using the tangent slope λ = (3x² + a)/(2y). When y = 0 the
 * tangent is vertical and 2P = O.
 *
 * @param curve - a validated curve.
 * @param point - a point on the curve.
 * @returns 2 · point.
 */
export function double(curve: Curve, point: Point): Point {
  return add(curve, point, point);
}

/** Which rule of the addition law applied. */
export type AdditionCase =
  /** P is O, so P + Q = Q. */
  | 'left-identity'
  /** Q is O, so P + Q = P. */
  | 'right-identity'
  /** Q = −P: the line through them is vertical, so the sum is O. */
  | 'inverses'
  /** P = Q with y = 0: the tangent is vertical, so 2P = O. */
  | 'vertical-tangent'
  /** P = Q with y ≠ 0: use the tangent slope. */
  | 'doubling'
  /** Two different points with different x: use the chord slope. */
  | 'chord';

/** The numbers behind the slope λ = numerator / denominator (mod p). */
export interface SlopeSteps {
  /** Numerator before reduction: y₂ − y₁ (chord) or 3x₁² + a (tangent). May be negative. */
  numeratorRaw: bigint;
  /** Numerator reduced into 0 … p − 1. */
  numerator: bigint;
  /** Denominator before reduction: x₂ − x₁ (chord) or 2y₁ (tangent). May be negative. */
  denominatorRaw: bigint;
  /** Denominator reduced into 0 … p − 1. */
  denominator: bigint;
  /** How the inverse of the denominator was found (extended Euclid, line by line). */
  inverse: InverseTrace;
  /** numerator × denominator⁻¹ before the final reduction. */
  product: bigint;
  /** The slope λ in 0 … p − 1. */
  lambda: bigint;
}

/** A finished addition with every intermediate value. */
export interface AdditionTrace {
  /** Which rule applied. */
  kind: AdditionCase;
  /** First input. */
  p: Point;
  /** Second input. */
  q: Point;
  /** The sum P + Q. */
  result: Point;
  /** Slope working; null for the cases that need no slope. */
  slope: SlopeSteps | null;
  /** λ² − x₁ − x₂ before reduction; null when there is no slope. */
  x3Raw: bigint | null;
  /** λ(x₁ − x₃) − y₁ before reduction; null when there is no slope. */
  y3Raw: bigint | null;
}

/**
 * Add two points and record the working (see {@link add} for the formulas).
 *
 * @param curve - a validated curve.
 * @param p - first point.
 * @param q - second point.
 * @returns the sum together with the case that applied and all intermediate numbers.
 * @throws EccError('NOT_ON_CURVE') when either point is not on the curve.
 */
export function addWithSteps(curve: Curve, p: Point, q: Point): AdditionTrace {
  assertOnCurve(curve, p, 'P');
  assertOnCurve(curve, q, 'Q');
  const noSlope = { slope: null, x3Raw: null, y3Raw: null };

  if (p === null) return { kind: 'left-identity', p, q, result: q, ...noSlope };
  if (q === null) return { kind: 'right-identity', p, q, result: p, ...noSlope };

  const prime = curve.p;
  const samePoint = p.x === q.x && p.y === q.y;

  if (p.x === q.x && mod(p.y + q.y, prime) === 0n) {
    // Vertical line. If the two points are the same point, its y must be 0.
    return { kind: samePoint ? 'vertical-tangent' : 'inverses', p, q, result: null, ...noSlope };
  }

  const numeratorRaw = samePoint ? 3n * p.x * p.x + curve.a : q.y - p.y;
  const denominatorRaw = samePoint ? 2n * p.y : q.x - p.x;
  const numerator = mod(numeratorRaw, prime);
  const denominator = mod(denominatorRaw, prime);
  const inverse = inverseTrace(denominator, prime);
  if (inverse.inverse === null) {
    // Cannot happen for a prime p and a non-zero denominator; kept as a safety net.
    throw new EccError('NO_INVERSE', `${denominator} has no inverse modulo ${prime}.`);
  }
  const product = numerator * inverse.inverse;
  const lambda = mod(product, prime);

  const x3Raw = lambda * lambda - p.x - q.x;
  const x3 = mod(x3Raw, prime);
  const y3Raw = lambda * (p.x - x3) - p.y;
  const y3 = mod(y3Raw, prime);

  return {
    kind: samePoint ? 'doubling' : 'chord',
    p,
    q,
    result: { x: x3, y: y3 },
    slope: { numeratorRaw, numerator, denominatorRaw, denominator, inverse, product, lambda },
    x3Raw,
    y3Raw,
  };
}

/**
 * Check a scalar before multiplying.
 *
 * @param k - the scalar.
 * @throws EccError('TOO_LARGE') when |k| has more than {@link MAX_SCALAR_BITS} bits.
 */
function assertScalarSize(k: bigint): void {
  const magnitude = k < 0n ? -k : k;
  if (bitLength(magnitude) > MAX_SCALAR_BITS) {
    throw new EccError(
      'TOO_LARGE',
      `k is too large: this app accepts scalars of up to ${MAX_SCALAR_BITS} bits (about 309 digits).`,
    );
  }
}

/**
 * Multiply a point by a scalar (fast version, no steps).
 *
 * Method: double-and-add, reading the bits of k from the left. Start with R = P for the
 * leading 1; for each later bit double R, and add P when the bit is 1. A 256-bit k needs
 * about 256 doublings and at most 256 additions instead of k − 1 additions.
 * Special cases: 0 · P = O, k · O = O, and (−k) · P = k · (−P).
 *
 * @param curve - a validated curve.
 * @param k - the scalar, any integer of up to {@link MAX_SCALAR_BITS} bits.
 * @param point - a point on the curve.
 * @returns k · point.
 * @throws EccError('NOT_ON_CURVE') when the point is not on the curve.
 * @throws EccError('TOO_LARGE') when k is oversized.
 */
export function multiply(curve: Curve, k: bigint, point: Point): Point {
  assertOnCurve(curve, point, 'P');
  assertScalarSize(k);
  if (k === 0n || point === null) return null;

  const base = k < 0n ? negate(curve, point) : point;
  const bits = (k < 0n ? -k : k).toString(2);
  let running: Point = base;
  for (let index = 1; index < bits.length; index += 1) {
    running = add(curve, running, running);
    if (bits[index] === '1') running = add(curve, running, base);
  }
  return running;
}

/** One row of the double-and-add table: what happened for one bit of k. */
export interface MultiplyRow {
  /** Position of the bit, counted from the left starting at 0. */
  index: number;
  /** The bit itself. */
  bit: 0 | 1;
  /**
   * What was done: 'start' (first bit, R = P), 'double' (bit 0: R = 2R) or
   * 'double-add' (bit 1: R = 2R + P).
   */
  operation: 'start' | 'double' | 'double-add';
  /** How many copies of P the running result stands for after this row. */
  multiple: bigint;
  /** Running result before this row (O for the first row). */
  before: Point;
  /** Result of the doubling in this row; null for the first row. */
  doubled: Point;
  /** Running result after this row. */
  result: Point;
}

/** A finished scalar multiplication with the full double-and-add table. */
export interface MultiplicationTrace {
  /** The scalar as given (may be negative). */
  k: bigint;
  /** The point as given. */
  p: Point;
  /** True when k was negative, so the table works with |k| and −P. */
  negated: boolean;
  /** |k|. */
  magnitude: bigint;
  /** The point the table actually adds: P, or −P when k was negative. */
  base: Point;
  /** |k| in binary, most significant bit first; empty when k = 0. */
  bits: string;
  /** One row per bit of |k|; empty when k = 0 or P = O. */
  rows: MultiplyRow[];
  /** Number of doublings performed. */
  doublings: number;
  /** Number of additions performed. */
  additions: number;
  /** The answer k · P. */
  result: Point;
}

/**
 * Multiply a point by a scalar and record the double-and-add table
 * (see {@link multiply} for the method).
 *
 * @param curve - a validated curve.
 * @param k - the scalar, any integer of up to {@link MAX_SCALAR_BITS} bits.
 * @param point - a point on the curve.
 * @returns the answer with one table row per bit of |k|.
 * @throws EccError('NOT_ON_CURVE') when the point is not on the curve.
 * @throws EccError('TOO_LARGE') when k is oversized.
 */
export function multiplyWithSteps(curve: Curve, k: bigint, point: Point): MultiplicationTrace {
  assertOnCurve(curve, point, 'P');
  assertScalarSize(k);

  const negated = k < 0n;
  const magnitude = negated ? -k : k;
  const base = negated ? negate(curve, point) : point;
  const bits = magnitude === 0n ? '' : magnitude.toString(2);
  const trace: MultiplicationTrace = {
    k,
    p: point,
    negated,
    magnitude,
    base,
    bits,
    rows: [],
    doublings: 0,
    additions: 0,
    result: null,
  };

  // 0 · P = O and k · O = O need no table at all.
  if (magnitude === 0n || base === null) return trace;

  let running: Point = base;
  let multiple = 1n;
  trace.rows.push({
    index: 0,
    bit: 1,
    operation: 'start',
    multiple,
    before: null,
    doubled: null,
    result: running,
  });

  for (let index = 1; index < bits.length; index += 1) {
    const before = running;
    const doubled = add(curve, before, before);
    trace.doublings += 1;
    multiple *= 2n;
    if (bits[index] === '1') {
      running = add(curve, doubled, base);
      trace.additions += 1;
      multiple += 1n;
      trace.rows.push({
        index,
        bit: 1,
        operation: 'double-add',
        multiple,
        before,
        doubled,
        result: running,
      });
    } else {
      running = doubled;
      trace.rows.push({
        index,
        bit: 0,
        operation: 'double',
        multiple,
        before,
        doubled,
        result: running,
      });
    }
  }

  trace.result = running;
  return trace;
}
