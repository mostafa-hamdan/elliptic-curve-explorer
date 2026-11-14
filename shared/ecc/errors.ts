/**
 * The one error type raised by the elliptic curve engine.
 * Every problem a user can cause (bad input, a point that is not on the curve, a curve
 * that is not valid) becomes an `EccError` with a plain-English message that a screen can
 * show as it is, plus a short code that tests and screens can branch on.
 */

/** Short machine-readable reason for an {@link EccError}. */
export type EccErrorCode =
  /** A required input was left empty. */
  | 'EMPTY'
  /** The input is not a whole number (letters, decimals, stray symbols). */
  | 'NOT_AN_INTEGER'
  /** The number is larger than the engine accepts. */
  | 'TOO_LARGE'
  /** The modulus p is not a prime number. */
  | 'NOT_PRIME'
  /** p is 2 or 3, where the equation y² = x³ + ax + b does not describe elliptic curves. */
  | 'PRIME_TOO_SMALL'
  /** 4a³ + 27b² ≡ 0 (mod p): the curve has a cusp or a crossing and is not a group. */
  | 'SINGULAR'
  /** The given (x, y) does not satisfy the curve equation. */
  | 'NOT_ON_CURVE'
  /** A value has no inverse for the given modulus (it shares a factor with it). */
  | 'NO_INVERSE'
  /** A modulus was zero or negative, or an exponent was negative. */
  | 'BAD_ARGUMENT'
  /** p is above the limit for listing every point. */
  | 'LIST_LIMIT';

/** An error with a message that is safe and clear enough to show to the user. */
export class EccError extends Error {
  /** Short reason code, see {@link EccErrorCode}. */
  readonly code: EccErrorCode;

  /**
   * @param code - short reason code.
   * @param message - full sentence for the user.
   */
  constructor(code: EccErrorCode, message: string) {
    super(message);
    this.name = 'EccError';
    this.code = code;
  }
}

/**
 * Tell whether an unknown thrown value is an {@link EccError}.
 * Used by screens to decide between "show this message" and "this is a real bug".
 *
 * @param error - anything caught by a `catch` block.
 * @returns true when the value is an EccError.
 */
export function isEccError(error: unknown): error is EccError {
  return error instanceof EccError;
}
