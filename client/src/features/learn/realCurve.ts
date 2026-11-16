/**
 * Elliptic curves over the real numbers, for the pictures on the Learn page.
 * Ordinary floating point is fine here: these numbers only draw a picture, they are
 * never used for a result. All results elsewhere use the exact engine in `shared/ecc`.
 */

/** A point of the real curve, or null for the point at infinity. */
export type RealPoint = { x: number; y: number } | null;

/** Two numbers closer than this count as equal (the pictures need no more precision). */
const EPSILON = 1e-9;

/**
 * Right-hand side of the curve equation.
 *
 * Formula: x³ + ax + b.
 *
 * @param a - coefficient a.
 * @param b - coefficient b.
 * @param x - the x value.
 * @returns x³ + ax + b.
 */
export function rhs(a: number, b: number, x: number): number {
  return x * x * x + a * x + b;
}

/**
 * Is the real curve singular?
 *
 * Formula: 4a³ + 27b² = 0, the same test as mod p, here with ordinary numbers.
 *
 * @param a - coefficient a.
 * @param b - coefficient b.
 * @returns true when the curve has a cusp or crosses itself.
 */
export function isSingularReal(a: number, b: number): boolean {
  return Math.abs(4 * a ** 3 + 27 * b ** 2) < 1e-9;
}

/**
 * Find x³ + ax + b = 0 between two x values where the sign changes, by halving the
 * interval 50 times (far more precise than a screen pixel).
 *
 * @param a - coefficient a.
 * @param b - coefficient b.
 * @param low - an x where the cubic has one sign.
 * @param high - an x where it has the other sign.
 * @returns the root between them.
 */
export function bisectRoot(a: number, b: number, low: number, high: number): number {
  let lo = low;
  let hi = high;
  const loSign = Math.sign(rhs(a, b, lo));
  for (let round = 0; round < 50; round += 1) {
    const mid = (lo + hi) / 2;
    if (Math.sign(rhs(a, b, mid)) === loSign) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The curve as drawable pieces: for each x interval where x³ + ax + b ≥ 0, the closed
 * outline running along the upper half (y = +√…) and back along the lower half. The ends
 * of each interval are found exactly, so the outline has no gap where y = 0.
 *
 * @param a - coefficient a.
 * @param b - coefficient b.
 * @param xMin - left edge of the picture.
 * @param xMax - right edge of the picture.
 * @param samples - number of x steps (more means smoother).
 * @returns one list of [x, y] pairs per piece, ready to join into a path.
 */
export function curvePieces(
  a: number,
  b: number,
  xMin: number,
  xMax: number,
  samples = 600,
): Array<Array<[number, number]>> {
  const step = (xMax - xMin) / samples;
  const pieces: Array<Array<[number, number]>> = [];
  let xs: number[] = [];

  const closePiece = () => {
    if (xs.length < 2) {
      xs = [];
      return;
    }
    const upper = xs.map((x): [number, number] => [x, Math.sqrt(Math.max(0, rhs(a, b, x)))]);
    const lower = [...xs]
      .reverse()
      .map((x): [number, number] => [x, -Math.sqrt(Math.max(0, rhs(a, b, x)))]);
    pieces.push([...upper, ...lower]);
    xs = [];
  };

  for (let index = 0; index <= samples; index += 1) {
    const x = xMin + index * step;
    const inside = rhs(a, b, x) >= 0;
    const previous = x - step;
    if (inside) {
      // Entering the curve between two samples: start exactly at the root.
      if (xs.length === 0 && index > 0 && rhs(a, b, previous) < 0) {
        xs.push(bisectRoot(a, b, previous, x));
      }
      xs.push(x);
    } else if (xs.length > 0) {
      // Leaving the curve: end exactly at the root, then close this piece.
      xs.push(bisectRoot(a, b, previous, x));
      closePiece();
    }
  }
  closePiece();
  return pieces;
}

/**
 * Add two points of the real curve with the chord-and-tangent rule.
 *
 * Formulas: λ = (y₂ − y₁)/(x₂ − x₁), or (3x₁² + a)/(2y₁) for P = Q;
 * x₃ = λ² − x₁ − x₂; y₃ = λ(x₁ − x₃) − y₁. A vertical line gives O.
 *
 * @param a - coefficient a.
 * @param p - first point.
 * @param q - second point.
 * @returns the sum, the slope λ (null for a vertical line) and the third point where the
 *          line meets the curve, −R, before reflecting.
 */
export function realAdd(
  a: number,
  p: RealPoint,
  q: RealPoint,
): { sum: RealPoint; lambda: number | null; third: RealPoint } {
  if (p === null) return { sum: q, lambda: null, third: null };
  if (q === null) return { sum: p, lambda: null, third: null };

  let lambda: number;
  if (Math.abs(p.x - q.x) < EPSILON) {
    // Same x: either mirror images (vertical chord) or the same point (tangent).
    if (Math.abs(p.y + q.y) < EPSILON) return { sum: null, lambda: null, third: null };
    lambda = (3 * p.x * p.x + a) / (2 * p.y);
  } else {
    lambda = (q.y - p.y) / (q.x - p.x);
  }
  const x3 = lambda * lambda - p.x - q.x;
  const y3 = lambda * (p.x - x3) - p.y;
  return { sum: { x: x3, y: y3 }, lambda, third: { x: x3, y: -y3 } };
}

/**
 * The point of the curve at a given x on the upper or lower half, moving x to the
 * nearest place where the curve exists when there is no point at that x.
 *
 * @param a - coefficient a.
 * @param b - coefficient b.
 * @param x - the wanted x.
 * @param upper - true for y ≥ 0, false for y ≤ 0.
 * @param xMin - smallest x allowed.
 * @param xMax - largest x allowed.
 * @returns the point, or null when the curve has no point in the range at all.
 */
export function pointNear(
  a: number,
  b: number,
  x: number,
  upper: boolean,
  xMin: number,
  xMax: number,
): RealPoint {
  let best: number | null = null;
  const step = (xMax - xMin) / 2000;
  for (let candidate = xMin; candidate <= xMax; candidate += step) {
    if (
      rhs(a, b, candidate) >= 0 &&
      (best === null || Math.abs(candidate - x) < Math.abs(best - x))
    ) {
      best = candidate;
    }
  }
  if (best === null) return null;
  const chosen = rhs(a, b, x) >= 0 && x >= xMin && x <= xMax ? x : best;
  const y = Math.sqrt(Math.max(0, rhs(a, b, chosen)));
  return { x: chosen, y: upper ? y : -y };
}
