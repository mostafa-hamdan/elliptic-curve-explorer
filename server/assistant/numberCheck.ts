/**
 * Checks an AI answer before it reaches the page: every point (x, y) and every number right
 * after "=" or "≡" must already appear in a tool result, the question, the user's current
 * work or an earlier turn. The model is asked to fix a first failure; a second one sends the
 * question to the offline helper. Numbers elsewhere in the prose are left alone, so a
 * conceptual answer ("a 256-bit curve") is not rejected.
 */
import type { ChatTurn } from './run.ts';

/** One whole number as written: decimal (with optional 1,234 grouping) or hexadecimal. */
const NUMBER = String.raw`[-+]?(?:0x[0-9a-f]+|\d{1,3}(?:,\d{3})+(?!\d)|\d+(?:\.\d+)?)`;

/** Every number token, wherever it is (used to collect what the sources contain). */
const ANY_NUMBER = new RegExp(NUMBER, 'gi');
/** Every plain run of digits or hexadecimal number, even inside a name such as P-256. */
const ANY_DIGITS = /0x[0-9a-f]+|\d+/gi;

/**
 * A point (x, y) with two numeric coordinates. A pair glued to a name or a function, as in
 * E23(1, 1) or gcd(6, 23), is not a point and is skipped.
 */
const PAIR = new RegExp(
  String.raw`(?<![\p{L}\p{N}_])\(\s*(${NUMBER})\s*,\s*(${NUMBER})\s*\)`,
  'giu',
);

/**
 * A number right after "=" or "≡", past spaces and markdown emphasis. A number glued to a
 * letter, a power or a sub/superscript (2P, 3x₁², 2^256) is algebra, not a result, and is
 * skipped; so is a pair, which {@link PAIR} checks.
 */
const RESULT = new RegExp(
  String.raw`[=≡]\s*[*_\x60]*\s*(${NUMBER})(?![\p{L}\d^⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]|[.,]\d)`,
  'giu',
);

/** The error thrown when an answer still fails the check after one reminder. */
export class UnverifiedAnswerError extends Error {
  /**
   * @param values - the values that could not be traced to any source.
   */
  constructor(readonly values: string[]) {
    super('The AI answer contains values that no tool produced.');
    this.name = 'UnverifiedAnswerError';
  }
}

/**
 * Write a number in one standard form so that "0x0B", "11", "+11" and "1,1" style
 * differences do not matter.
 *
 * @param token - a number as written.
 * @returns its canonical text: decimal, no grouping, no leading zeros or plus sign.
 */
export function canonicalNumber(token: string): string {
  const text = token.replace(/[,+]/g, '').toLowerCase();
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  if (body.includes('.')) return text;
  const value = BigInt(body.startsWith('0x') ? body : body.replace(/^0+(?=\d)/, ''));
  return (negative ? -value : value).toString();
}

/** Replace the typographic minus and dashes the model may use with a plain hyphen. */
function plainMinus(text: string): string {
  return text.replace(/[−–‒]/g, '-');
}

/**
 * List what an answer states that the sources do not contain.
 *
 * @param answer - the model's answer.
 * @param sources - tool results, the question, the current work and earlier turns.
 * @returns each unsupported point or result, as written in the answer (no duplicates).
 */
export function unsupportedValues(answer: string, sources: string[]): string[] {
  const known = new Set<string>();
  const knownPairs = new Set<string>();
  for (const source of sources.map(plainMinus)) {
    // Collected generously, both ways, so "1,234" also yields 1 and 234 and "P-256" yields 256.
    for (const match of source.matchAll(ANY_NUMBER)) known.add(canonicalNumber(match[0]));
    for (const match of source.matchAll(ANY_DIGITS)) known.add(canonicalNumber(match[0]));
    for (const match of source.matchAll(PAIR)) {
      knownPairs.add(`${canonicalNumber(match[1]!)},${canonicalNumber(match[2]!)}`);
    }
  }

  const text = plainMinus(answer);
  const missing = new Set<string>();
  for (const match of text.matchAll(PAIR)) {
    const key = `${canonicalNumber(match[1]!)},${canonicalNumber(match[2]!)}`;
    if (!knownPairs.has(key)) missing.add(match[0].replace(/\s+/g, ' '));
  }
  for (const match of text.matchAll(RESULT)) {
    if (!known.has(canonicalNumber(match[1]!))) missing.add(match[1]!);
  }
  return [...missing];
}

/**
 * Follows one question through the tool loop: collects what the sources say, and judges the
 * final answer. Used the same way by both providers.
 */
export class AnswerCheck {
  private readonly sources: string[];
  private reminded = false;

  /**
   * @param history - earlier turns.
   * @param question - the user's question.
   * @param context - the description of the user's current work.
   */
  constructor(history: ChatTurn[], question: string, context: string) {
    this.sources = [question, context, ...history.map((turn) => turn.text)];
  }

  /** Remember a tool result: everything in it may be quoted in the answer. */
  addToolResult(result: string): void {
    this.sources.push(result);
  }

  /**
   * Judge a final answer.
   *
   * @param answer - the model's answer.
   * @returns null when the answer passes; otherwise, the first time, a reminder to send.
   * @throws UnverifiedAnswerError when the answer fails again after the reminder.
   */
  review(answer: string): string | null {
    const missing = unsupportedValues(answer, this.sources);
    if (missing.length === 0) return null;
    if (this.reminded) throw new UnverifiedAnswerError(missing);
    this.reminded = true;
    return `Check failed: ${missing.slice(0, 10).join(', ')} ${missing.length === 1 ? 'does' : 'do'} not appear in any tool result or in my messages. Every point and every value after "=" or "≡" must come from a tool result. Call the tools to compute ${missing.length === 1 ? 'it' : 'them'}, or leave ${missing.length === 1 ? 'it' : 'them'} out, then give your answer again.`;
  }
}
