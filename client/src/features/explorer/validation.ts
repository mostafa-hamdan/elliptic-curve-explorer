/**
 * Live validation of everything the user types on the Explorer page: the curve
 * parameters, the points P and Q and the scalar k. These are plain functions with no
 * screen code, so they are unit-tested directly and the screens only display the result.
 */
import {
  assertValidModulus,
  bitLength,
  curveSides,
  isEccError,
  MAX_SCALAR_BITS,
  mod,
  singularityValue,
  tryParseInteger,
  type Curve,
  type Point,
} from '@shared/ecc/index.ts';

/** The outcome of checking one input box. */
export interface FieldCheck {
  /** 'empty' = nothing typed yet, 'ok' = a usable number, 'error' = unusable text. */
  status: 'empty' | 'ok' | 'error';
  /** The number, when status is 'ok'. */
  value: bigint | null;
  /** Message to show: the problem for 'error', the "please enter" text for 'empty'. */
  message: string | null;
}

/**
 * Check that a box holds a whole number.
 *
 * @param text - what the user typed.
 * @param label - name of the box for messages, for example "p".
 * @returns the status, the number if there is one, and a message otherwise.
 */
export function checkInteger(text: string, label: string): FieldCheck {
  const parsed = tryParseInteger(text, label);
  if (parsed.ok) return { status: 'ok', value: parsed.value, message: null };
  return {
    status: parsed.code === 'EMPTY' ? 'empty' : 'error',
    value: null,
    message: parsed.message,
  };
}

/** The outcome of checking p, a and b together. */
export interface CurveCheck {
  p: FieldCheck;
  a: FieldCheck;
  b: FieldCheck;
  /** The curve, when all three boxes are fine and the curve is non-singular. */
  curve: Curve | null;
  /** True when p, a, b are all fine but 4a³ + 27b² ≡ 0 (mod p). */
  singular: boolean;
  /** (4a³ + 27b²) mod p, when it can be computed. */
  singularity: bigint | null;
  /** a reduced mod p, when p is valid and a is a number. */
  aReduced: bigint | null;
  /** b reduced mod p, when p is valid and b is a number. */
  bReduced: bigint | null;
  /** Number of bits in p, when p is valid. */
  bits: number | null;
}

/**
 * Validate the three curve boxes.
 *
 * Order of checks, matching what a person would do by hand: each box must hold a whole
 * number; p must be a prime greater than 3; a and b are reduced mod p; finally
 * 4a³ + 27b² must not be ≡ 0 (mod p).
 *
 * @param pText - text of the p box.
 * @param aText - text of the a box.
 * @param bText - text of the b box.
 * @returns per-box results plus the curve when everything is valid.
 */
export function checkCurve(pText: string, aText: string, bText: string): CurveCheck {
  let p = checkInteger(pText, 'p');
  const a = checkInteger(aText, 'a');
  const b = checkInteger(bText, 'b');

  if (p.status === 'ok' && p.value !== null) {
    try {
      assertValidModulus(p.value);
    } catch (error) {
      if (!isEccError(error)) throw error;
      p = { status: 'error', value: null, message: error.message };
    }
  }

  const result: CurveCheck = {
    p,
    a,
    b,
    curve: null,
    singular: false,
    singularity: null,
    aReduced: null,
    bReduced: null,
    bits: null,
  };
  if (p.value === null) return result;

  result.bits = bitLength(p.value);
  if (a.value !== null) result.aReduced = mod(a.value, p.value);
  if (b.value !== null) result.bReduced = mod(b.value, p.value);
  if (result.aReduced === null || result.bReduced === null) return result;

  result.singularity = singularityValue(p.value, result.aReduced, result.bReduced);
  if (result.singularity === 0n) {
    result.singular = true;
  } else {
    result.curve = { p: p.value, a: result.aReduced, b: result.bReduced };
  }
  return result;
}

/** What the user has typed for one point. */
export interface PointDraft {
  x: string;
  y: string;
  /** True when "point at infinity" is ticked; x and y are then ignored. */
  infinity: boolean;
}

/** The outcome of checking one point against the current curve. */
export interface PointCheck {
  x: FieldCheck;
  y: FieldCheck;
  /**
   * The usable point: `null` is the point at infinity O. `undefined` means there is no
   * usable point yet (something is missing, not a number, or not on the curve).
   */
  point: Point | undefined;
  /** Both sides of the curve equation, when x, y and the curve are all available. */
  sides: { left: bigint; right: bigint } | null;
  /** Whether (x, y) satisfies the equation; null when that cannot be decided yet. */
  onCurve: boolean | null;
  /** True when a coordinate was outside 0 … p − 1 and has been reduced mod p. */
  wasReduced: boolean;
}

/**
 * Validate one point.
 *
 * @param curve - the current curve, or null when the curve itself is not valid yet.
 * @param draft - what the user typed.
 * @param label - "P" or "Q", used in messages.
 * @returns per-box results, both sides of the equation and the point when it is usable.
 */
export function checkPoint(curve: Curve | null, draft: PointDraft, label: string): PointCheck {
  const untouched: FieldCheck = { status: 'ok', value: null, message: null };

  if (draft.infinity) {
    // O is on every curve and has no coordinates to check.
    return {
      x: untouched,
      y: untouched,
      point: null,
      sides: null,
      onCurve: true,
      wasReduced: false,
    };
  }

  const x = checkInteger(draft.x, `x of ${label}`);
  const y = checkInteger(draft.y, `y of ${label}`);
  const result: PointCheck = {
    x,
    y,
    point: undefined,
    sides: null,
    onCurve: null,
    wasReduced: false,
  };
  if (curve === null || x.value === null || y.value === null) return result;

  const reduced = { x: mod(x.value, curve.p), y: mod(y.value, curve.p) };
  result.wasReduced = reduced.x !== x.value || reduced.y !== y.value;
  result.sides = curveSides(curve, reduced.x, reduced.y);
  result.onCurve = result.sides.left === result.sides.right;
  if (result.onCurve) result.point = reduced;
  return result;
}

/**
 * Say in one sentence why a point cannot be used yet.
 *
 * @param check - the result of {@link checkPoint}.
 * @param label - "P" or "Q".
 * @returns the reason, or null when the point is usable.
 */
export function pointProblem(check: PointCheck, label: string): string | null {
  if (check.point !== undefined) return null;
  if (check.x.status === 'error' || check.y.status === 'error') {
    return `Point ${label} has a coordinate that is not a whole number.`;
  }
  if (check.x.status === 'empty' || check.y.status === 'empty') {
    return `Enter both coordinates of ${label}, or tick “Point at infinity (O)”.`;
  }
  if (check.onCurve === false) {
    return `${label} is not on the curve, so it cannot be used. Both sides of the equation are shown under the point.`;
  }
  return `Point ${label} cannot be checked until the curve is valid.`;
}

/**
 * Validate the scalar k.
 *
 * @param text - text of the k box.
 * @returns the number when it is a whole number of at most 1024 bits, else a message.
 */
export function checkScalar(text: string): FieldCheck {
  const k = checkInteger(text, 'k');
  if (k.value === null) return k;
  const magnitude = k.value < 0n ? -k.value : k.value;
  if (bitLength(magnitude) > MAX_SCALAR_BITS) {
    return {
      status: 'error',
      value: null,
      message: `k is too large: this app accepts scalars of up to ${MAX_SCALAR_BITS} bits (about 309 digits).`,
    };
  }
  return k;
}
