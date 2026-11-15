/**
 * Turning engine values into text for the screen: grouped counts, shortened 256-bit
 * numbers, and the curve equation with its actual coefficients.
 */
import type { Curve, Point } from '@shared/ecc/index.ts';

/** Numbers longer than this many digits are shortened in tables. */
export const LONG_NUMBER_DIGITS = 24;

/**
 * Shorten a very long number for tables: "115792089237…908834671663".
 * Short numbers are returned unchanged. The full value is always available elsewhere
 * on the screen (in the steps or behind a copy button), never lost.
 *
 * @param value - the number.
 * @param keep - how many digits to keep at each end.
 * @returns the decimal text, with the middle replaced by "…" when it is long.
 */
export function shortNumber(value: bigint, keep = 10): string {
  const text = value.toString();
  const digits = value < 0n ? text.length - 1 : text.length;
  if (digits <= LONG_NUMBER_DIGITS) return text;
  return `${text.slice(0, keep + (value < 0n ? 1 : 0))}…${text.slice(-keep)}`;
}

/**
 * Write a point, optionally shortening long coordinates.
 *
 * @param point - a point, or null for the point at infinity.
 * @param short - true to shorten long coordinates (for tables).
 * @returns "O" or "(x, y)".
 */
export function pointText(point: Point, short = false): string {
  if (point === null) return 'O';
  const show = short ? shortNumber : (value: bigint) => value.toString();
  return `(${show(point.x)}, ${show(point.y)})`;
}

/**
 * Put a negative number in brackets so it reads correctly inside a formula:
 * "11 · (−14)" rather than "11 · −14". Uses the real minus sign.
 *
 * @param value - the number.
 * @returns the text, bracketed when negative.
 */
export function signed(value: bigint): string {
  return value < 0n ? `(−${-value})` : value.toString();
}

/**
 * A number as plain text with the real minus sign (−) instead of a hyphen.
 *
 * @param value - the number.
 * @returns for example "−164" or "20".
 */
export function plain(value: bigint): string {
  return value < 0n ? `−${-value}` : value.toString();
}

/**
 * Group the digits of a count: 199999 → "199,999".
 *
 * @param value - a count.
 * @returns the grouped text.
 */
export function grouped(value: number | bigint): string {
  return value.toLocaleString('en-US');
}

/**
 * The curve equation with its numbers filled in, simplified the way it is written by
 * hand: a term with coefficient 0 is left out and a coefficient of 1 is not written.
 *
 * @param curve - a validated curve.
 * @returns for example "y² ≡ x³ + x + 1 (mod 23)", or null when the numbers are too
 *          long to read comfortably in one line (256-bit curves).
 */
export function equationText(curve: Curve): string | null {
  const longest = Math.max(
    curve.p.toString().length,
    curve.a.toString().length,
    curve.b.toString().length,
  );
  if (longest > 12) return null;

  let right = 'x³';
  if (curve.a === 1n) right += ' + x';
  else if (curve.a !== 0n) right += ` + ${curve.a}x`;
  if (curve.b !== 0n) right += ` + ${curve.b}`;
  return `y² ≡ ${right} (mod ${curve.p})`;
}

/**
 * A stable text key for a curve, used to tell whether a stored result still belongs to
 * the curve on screen.
 *
 * @param curve - a validated curve, or null.
 * @returns "p:a:b", or an empty string for no curve.
 */
export function curveKey(curve: Curve | null): string {
  return curve === null ? '' : `${curve.p}:${curve.a}:${curve.b}`;
}
