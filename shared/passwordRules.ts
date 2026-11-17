/**
 * The password rules, shared by the sign-up page (live strength meter) and the server
 * (which enforces them): at least 12 characters, not a commonly used password, no simple
 * pattern (repeats, keyboard runs, sequences), and rated at least Fair. Strength is
 * measured with zxcvbn, a widely used estimator, with its list of about 49,000 common
 * passwords, plus the pattern checks below for the short mixes it can miss.
 */
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as english from '@zxcvbn-ts/language-en';

/** Shortest password accepted. */
export const MIN_PASSWORD_LENGTH = 12;
/** Longest password accepted (hashing very long input would waste server time). */
export const MAX_PASSWORD_LENGTH = 128;
/**
 * Lowest score accepted, on the 0 (weakest) to 4 (strongest) scale: 2 is "Fair". Anything
 * rated Weak or Very weak is refused.
 */
export const MIN_PASSWORD_SCORE = 2;

/** The strength estimator, set up once with the common-password and English word lists. */
const estimator = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...english.dictionary },
  graphs: common.adjacencyGraphs,
  translations: english.translations,
});

/** The bundled common passwords, for an exact check. */
const COMMON = new Set(common.dictionary['passwords-common']);

/** Keyboard rows (US layout), used to spot runs of neighboring keys such as "asdf" or "sadd". */
const KEY_ROWS = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
/** How far each row is shifted to the right on a real keyboard, in key widths. */
const ROW_SHIFT = [0, 0.5, 0.75, 1.25];

/** Position of each key on the keyboard, as (column, row). */
const KEY_POSITION = new Map<string, { x: number; y: number }>();
KEY_ROWS.forEach((row, y) => {
  [...row].forEach((key, column) => KEY_POSITION.set(key, { x: column + (ROW_SHIFT[y] ?? 0), y }));
});

/**
 * Are two characters next to each other on the keyboard (or the same key)?
 *
 * @param a - one character.
 * @param b - the next character.
 * @returns true for the same key or a touching key.
 */
export function keyboardNeighbors(a: string, b: string): boolean {
  const first = KEY_POSITION.get(a.toLowerCase());
  const second = KEY_POSITION.get(b.toLowerCase());
  if (!first || !second) return false;
  return Math.hypot(first.x - second.x, first.y - second.y) <= 1.3;
}

/** Share of steps that must be predictable before a password counts as a pattern. */
const PATTERN_SHARE = 0.6;

/**
 * Look for the patterns the estimator can miss in short mixes, such as "aaaaaasassdd":
 * very few different characters, or a password made mostly of repeated characters,
 * neighboring keys and alphabet or number steps (a→b, 3→4).
 *
 * @param password - the proposed password.
 * @returns a sentence saying what is predictable, or null when nothing is.
 */
export function predictablePattern(password: string): string | null {
  const characters = [...password];
  if (characters.length < 2) return null;
  const distinct = new Set(characters.map((character) => character.toLowerCase())).size;
  if (distinct <= Math.ceil(characters.length / 3)) {
    return `It uses only ${distinct} different character${distinct === 1 ? '' : 's'}.`;
  }
  let predictable = 0;
  for (let index = 1; index < characters.length; index += 1) {
    const before = characters[index - 1]!.toLowerCase();
    const after = characters[index]!.toLowerCase();
    const step = Math.abs(after.charCodeAt(0) - before.charCodeAt(0));
    if (step <= 1 || keyboardNeighbors(before, after)) predictable += 1;
  }
  if (predictable / (characters.length - 1) >= PATTERN_SHARE) {
    return 'It is mostly repeated characters, keys next to each other or sequences such as "asdf" or "abcd".';
  }
  return null;
}

/** The verdict on a password. */
export interface PasswordCheck {
  /** 0 (very weak) to 4 (very strong). */
  score: number;
  /** Plain-English label for the score. */
  label: 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong';
  /** Why it is refused, or null when it is accepted. */
  problem: string | null;
  /** One tip for making it stronger, when there is one. */
  tip: string | null;
}

const LABELS: PasswordCheck['label'][] = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

/**
 * Check a password against the rules.
 *
 * @param password - the proposed password.
 * @param email - the account's email, so a password made from it can be refused.
 * @returns the score, its label, and the reason it is refused (if it is).
 */
export function checkPassword(password: string, email = ''): PasswordCheck {
  const userInputs = email ? [email, ...email.split(/[@.]/)] : [];
  const result = estimator.check(password.slice(0, MAX_PASSWORD_LENGTH), userInputs);
  // A predictable pattern caps the rating at Weak, whatever the estimator thought.
  const pattern = predictablePattern(password);
  const score = pattern ? Math.min(result.score, 1) : result.score;
  let problem: string | null = null;
  if (password.length < MIN_PASSWORD_LENGTH) {
    problem = `Use at least ${MIN_PASSWORD_LENGTH} characters (you have ${password.length}).`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    problem = `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  } else if (COMMON.has(password.toLowerCase())) {
    problem = 'This is one of the most common passwords. Choose something less predictable.';
  } else if (score < MIN_PASSWORD_SCORE) {
    problem = `Too weak (rated ${LABELS[score] ?? 'Very weak'}; at least Fair is needed). ${
      pattern ?? 'It is too easy to guess.'
    } Add a few unrelated words or characters.`;
  }
  return {
    score,
    label: LABELS[score] ?? 'Very weak',
    problem,
    tip: pattern ?? result.feedback.warning ?? result.feedback.suggestions[0] ?? null,
  };
}
