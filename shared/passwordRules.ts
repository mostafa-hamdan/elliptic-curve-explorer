/**
 * The password rules, shared by the sign-up page (live strength meter) and the server
 * (which enforces them): at least 12 characters, not a commonly used password, and not too
 * easy to guess. Strength is measured with zxcvbn, a widely used estimator, and its
 * bundled list of about 49,000 common passwords.
 */
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as english from '@zxcvbn-ts/language-en';

/** Shortest password accepted. */
export const MIN_PASSWORD_LENGTH = 12;
/** Longest password accepted (hashing very long input would waste server time). */
export const MAX_PASSWORD_LENGTH = 128;
/** Lowest zxcvbn score accepted, on its 0 (weakest) to 4 (strongest) scale. */
export const MIN_PASSWORD_SCORE = 3;

/** The strength estimator, set up once with the common-password and English word lists. */
const estimator = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...english.dictionary },
  graphs: common.adjacencyGraphs,
  translations: english.translations,
});

/** The bundled common passwords, for an exact check. */
const COMMON = new Set(common.dictionary['passwords-common']);

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
  const score = result.score;
  let problem: string | null = null;
  if (password.length < MIN_PASSWORD_LENGTH) {
    problem = `Use at least ${MIN_PASSWORD_LENGTH} characters (you have ${password.length}).`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    problem = `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  } else if (COMMON.has(password.toLowerCase())) {
    problem = 'This is one of the most common passwords. Choose something less predictable.';
  } else if (score < MIN_PASSWORD_SCORE) {
    problem = 'This password is too easy to guess. Add more unrelated words or characters.';
  }
  return {
    score,
    label: LABELS[score] ?? 'Very weak',
    problem,
    tip: result.feedback.warning ?? result.feedback.suggestions[0] ?? null,
  };
}
