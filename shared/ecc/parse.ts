/**
 * Turning text typed by a person into a `bigint`, with clear messages when it is not a
 * whole number. Used by every input box on the website and by the server, so the same
 * text is accepted or refused the same way everywhere.
 */
import { EccError } from './errors.ts';

/**
 * Longest input accepted, in characters. A 1024-bit number has 309 decimal digits, so
 * this leaves room for separators while stopping someone pasting a whole book.
 */
export const MAX_INPUT_LENGTH = 400;

/** Decimal: optional sign, then digits. */
const DECIMAL_PATTERN = /^[+-]?\d+$/;
/** Hexadecimal: optional sign, 0x, then hex digits. Handy for real 256-bit curves. */
const HEX_PATTERN = /^[+-]?0x[0-9a-f]+$/i;

/**
 * Read a whole number from text.
 *
 * Accepted: decimal ("23", "-5", "+7") and hexadecimal with a 0x prefix ("0xFF").
 * Spaces, underscores and commas used as digit separators are ignored ("1 000", "1,000").
 *
 * @param text - what the user typed.
 * @param label - name of the field for the message, for example "p" or "k".
 * @returns the number as a bigint.
 * @throws EccError('EMPTY') when nothing was typed.
 * @throws EccError('TOO_LARGE') when the text is longer than {@link MAX_INPUT_LENGTH}.
 * @throws EccError('NOT_AN_INTEGER') for letters, decimals or any other non-integer text.
 */
export function parseInteger(text: string, label: string): bigint {
  if (text.length > MAX_INPUT_LENGTH) {
    throw new EccError(
      'TOO_LARGE',
      `${label} is too long: at most ${MAX_INPUT_LENGTH} characters are accepted.`,
    );
  }

  const cleaned = text.replace(/[\s_,]/g, '');
  if (cleaned === '') {
    throw new EccError('EMPTY', `Enter a value for ${label}.`);
  }

  if (DECIMAL_PATTERN.test(cleaned)) {
    return BigInt(cleaned);
  }

  if (HEX_PATTERN.test(cleaned)) {
    // BigInt() understands "0x…" but not a sign in front of it, so handle the sign here.
    const negative = cleaned.startsWith('-');
    const unsigned = cleaned.replace(/^[+-]/, '');
    const value = BigInt(unsigned);
    return negative ? -value : value;
  }

  if (/^[+-]?\d*[.]\d*$/.test(cleaned) && /\d/.test(cleaned)) {
    throw new EccError(
      'NOT_AN_INTEGER',
      `${label} must be a whole number, without a decimal point.`,
    );
  }

  throw new EccError(
    'NOT_AN_INTEGER',
    `${label} must be a whole number: digits only, or hexadecimal starting with 0x.`,
  );
}

/**
 * Like {@link parseInteger} but returns a result object instead of throwing, which is
 * more convenient for live validation while the user is still typing.
 *
 * @param text - what the user typed.
 * @param label - name of the field for the message.
 * @returns `{ ok: true, value }` or `{ ok: false, code, message }`.
 */
export function tryParseInteger(
  text: string,
  label: string,
): { ok: true; value: bigint } | { ok: false; code: EccError['code']; message: string } {
  try {
    return { ok: true, value: parseInteger(text, label) };
  } catch (error) {
    if (error instanceof EccError) {
      return { ok: false, code: error.code, message: error.message };
    }
    throw error;
  }
}
