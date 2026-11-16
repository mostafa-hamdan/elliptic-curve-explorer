/**
 * The offline helper: answers questions without a network or a key. It can explain the
 * last result from the engine's step data, compute a modular inverse or test a prime with
 * the engine, and answer common questions from the built-in topics. Anything outside
 * elliptic curves and this app is politely declined.
 */
import {
  findSmallFactor,
  inverseTrace,
  isPrime,
  tryParseInteger,
  type Curve,
} from '@shared/ecc/index.ts';
import type { AddOutcome, MultiplyOutcome } from '../explorer/ExplorerContext.tsx';
import {
  explainAddition,
  explainMultiplication,
  explainPoints,
  type PointsSummary,
} from './explain.ts';
import { SUBJECT_WORDS, TOPICS } from './knowledge.ts';

/** Longest question accepted, in characters. */
export const MAX_QUESTION_LENGTH = 500;

/** What the helper knows about the user's current work. */
export interface HelperContext {
  curve: Curve | null;
  add: AddOutcome | null;
  multiply: MultiplyOutcome | null;
  /** The finished point list for the current curve, if any. */
  points: PointsSummary | null;
  /** Which of add / multiply was calculated last. */
  lastResult: 'add' | 'multiply' | null;
  /** The tab that is showing; breaks ties when deciding what "my last result" means. */
  tab: 'points' | 'add' | 'multiply';
}

/** An answer and where it came from (used by the tests and to label the answer). */
export interface HelperAnswer {
  text: string;
  source: 'explain' | 'compute' | 'topic' | 'decline' | 'fallback' | 'empty';
}

/** Suggested questions shown as buttons in the assistant panel. */
export const SUGGESTIONS: ReadonlyArray<string> = [
  'Explain my last result',
  'What is the point at infinity?',
  'Why must p be prime?',
  'How does double-and-add work?',
  'What is Hasse’s bound?',
  'Inverse of 6 mod 23',
];

/** Lower-case the question and straighten curly quotes so matching is predictable. */
function normalise(question: string): string {
  return question
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Does the text contain the word (or its plural) as a whole word? */
function hasWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}s?($|[^\\p{L}\\p{N}])`, 'u').test(text);
}

/**
 * Explain whichever result the user most likely means by "my last result".
 *
 * @param context - the current work.
 * @returns the explanation, or a hint on how to get a result first.
 */
export function explainLast(context: HelperContext): HelperAnswer {
  const { add, multiply, points, tab, lastResult } = context;
  // The tab on screen wins when it has a result; otherwise the most recent calculation.
  if (tab === 'points' && points) return { text: explainPoints(points), source: 'explain' };
  if (tab === 'add' && add)
    return { text: explainAddition(add.curve, add.trace), source: 'explain' };
  if (tab === 'multiply' && multiply) {
    return { text: explainMultiplication(multiply.curve, multiply.trace), source: 'explain' };
  }
  if (lastResult === 'add' && add)
    return { text: explainAddition(add.curve, add.trace), source: 'explain' };
  if (lastResult === 'multiply' && multiply) {
    return { text: explainMultiplication(multiply.curve, multiply.trace), source: 'explain' };
  }
  if (points) return { text: explainPoints(points), source: 'explain' };
  return {
    text: 'There is no result to explain yet. Calculate something first: press **Find all points**, **Calculate P + Q** or **Calculate kP** on the Explorer page, then ask again.',
    source: 'explain',
  };
}

/**
 * Compute a modular inverse with the engine and write out the Euclid lines.
 *
 * @param valueText - the number to invert, as typed.
 * @param modulusText - the modulus, as typed.
 * @returns the answer, or an explanation of why there is none.
 */
function answerInverse(valueText: string, modulusText: string): HelperAnswer {
  const value = tryParseInteger(valueText, 'the number');
  const modulus = tryParseInteger(modulusText, 'the modulus');
  if (!value.ok || !modulus.ok) {
    return {
      text: 'Please give two whole numbers, for example "inverse of 6 mod 23".',
      source: 'compute',
    };
  }
  if (modulus.value < 2n) {
    return { text: 'The modulus must be at least 2.', source: 'compute' };
  }
  if (modulus.value.toString().length > 40) {
    return {
      text: 'That modulus is too long to write the steps out here. The Add points tab shows the same algorithm for numbers of any size.',
      source: 'compute',
    };
  }
  const trace = inverseTrace(value.value, modulus.value);
  const lines = trace.steps.map(
    (step) => `- ${step.dividend} = ${step.quotient} · ${step.divisor} + ${step.remainder}`,
  );
  if (trace.inverse === null) {
    return {
      text: [
        `${trace.value} has **no inverse** modulo ${modulus.value}: gcd(${trace.value}, ${modulus.value}) = ${trace.gcd}, not 1.`,
        ...lines,
      ].join('\n'),
      source: 'compute',
    };
  }
  return {
    text: [
      `${trace.value}⁻¹ ≡ **${trace.inverse}** (mod ${modulus.value}). The extended Euclidean algorithm:`,
      ...lines,
      `Check: ${trace.value} · ${trace.inverse} = ${trace.value * trace.inverse} ≡ 1 (mod ${modulus.value}).`,
    ].join('\n'),
    source: 'compute',
  };
}

/**
 * Test a number for primality with the engine.
 *
 * @param numberText - the number, as typed.
 * @returns the verdict, with a factor when one is small enough to find.
 */
function answerPrime(numberText: string): HelperAnswer {
  const parsed = tryParseInteger(numberText, 'the number');
  if (!parsed.ok)
    return { text: 'Please give a whole number, for example "is 97 prime?".', source: 'compute' };
  const n = parsed.value;
  if (isPrime(n)) {
    const usable =
      n > 3n
        ? ' It can be used as p for a curve.'
        : ' It is too small to use as p for a curve, which needs p > 3.';
    return { text: `**Yes**, ${n} is prime.${usable}`, source: 'compute' };
  }
  const factor = n >= 4n ? findSmallFactor(n) : null;
  const detail = factor !== null ? ` (${n} = ${factor} × ${n / factor})` : '';
  return { text: `**No**, ${n} is not prime${detail}.`, source: 'compute' };
}

/**
 * Answer a question without the network.
 *
 * @param question - what the user typed.
 * @param context - the user's current work, for "explain my last result".
 * @returns the answer and where it came from.
 */
export function answerOffline(question: string, context: HelperContext): HelperAnswer {
  const text = normalise(question);
  if (text === '')
    return { text: 'Type a question, or pick one of the suggestions.', source: 'empty' };
  if (question.length > MAX_QUESTION_LENGTH) {
    return {
      text: `Please keep questions under ${MAX_QUESTION_LENGTH} characters.`,
      source: 'empty',
    };
  }

  // "Explain my last result", "explain this", "what did I just get?"
  if (
    /\bexplain\b.*\b(last|result|this|my|answer|step|steps)\b|\bwhat did i (just )?get\b/.test(text)
  ) {
    return explainLast(context);
  }

  const inverseMatch = text.match(
    /inverse of\s+([+-]?(?:0x[0-9a-f]+|\d+))\s*(?:mod(?:ulo)?|\(mod)\s*([+-]?(?:0x[0-9a-f]+|\d+))/,
  );
  if (inverseMatch?.[1] && inverseMatch[2]) {
    return answerInverse(inverseMatch[1], inverseMatch[2]);
  }

  // The question is at most 500 characters, so the number is too: the test stays instant.
  const primeMatch = text.match(/\bis\s+([+-]?(?:0x[0-9a-f]+|\d+))\s+(?:a\s+)?prime\b/);
  if (primeMatch?.[1]) return answerPrime(primeMatch[1]);

  // Built-in topics: phrases count three times as much as single words.
  let best: { score: number; answer: string } | null = null;
  for (const topic of TOPICS) {
    let score = 0;
    for (const keyword of topic.keywords) {
      const isPhrase = /[\s\-+'^³²]/.test(keyword) || keyword.length <= 2;
      if (isPhrase ? text.includes(keyword) : hasWord(text, keyword)) score += isPhrase ? 3 : 1;
    }
    if (score > 0 && (best === null || score > best.score)) best = { score, answer: topic.answer };
  }
  if (best) return { text: best.answer, source: 'topic' };

  const onSubject = SUBJECT_WORDS.some((word) => hasWord(text, word));
  if (!onSubject) {
    return {
      text: 'I can only help with **elliptic curves**, modular arithmetic and this app. Try one of the suggestions, or ask something like "how do I add two points?".',
      source: 'decline',
    };
  }
  return {
    text: 'I do not have a built-in answer for that. I can explain your last result, compute an inverse ("inverse of 6 mod 23"), test a prime ("is 97 prime?"), and answer questions about the point at infinity, adding and doubling, double-and-add, Hasse’s bound, the order of a point and key exchange.',
    source: 'fallback',
  };
}
