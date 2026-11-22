/**
 * What every AI provider of the assistant has in common: the instructions, the limits on
 * one answer, and the small interface the route talks to. The provider-specific tool loops
 * live in `anthropic.ts` and `openai.ts`, so both follow exactly the same rules.
 */

/** Most tool rounds in one answer; a normal answer needs one to three. */
export const MAX_TOOL_ROUNDS = 6;
/** Longest answer passed on to the page. */
export const MAX_ANSWER_LENGTH = 6000;
/** Most tokens the model may produce in one request. */
export const MAX_OUTPUT_TOKENS = 4000;

/** Shown when the model refuses a request. */
export const DECLINED_TEXT =
  'I cannot help with that request. Ask me about elliptic curves or this app instead.';
/** Shown when an answer needs more tool rounds than {@link MAX_TOOL_ROUNDS}. */
export const TOO_MANY_ROUNDS_TEXT =
  'That needed too many calculations for one answer. Try asking about one step at a time.';

/** One earlier turn of the conversation, as plain text. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * The instructions for the model. They set the scope (elliptic curves and this app only),
 * require every number to come from a tool, and forbid calling the app safe for real keys.
 */
export const SYSTEM_PROMPT = `You are the assistant inside OnCurve, a learning app for elliptic curves over prime fields, Ep(a, b): y² ≡ x³ + ax + b (mod p). Students use it to find all points, add points and multiply a point by a scalar, with the hand-method steps shown.

Help with elliptic curves, modular arithmetic, elliptic curve cryptography and how to use this app. Politely decline anything else in one sentence and suggest an on-topic question.

Every number you state about a specific curve, point, inverse or result must come from a tool result in this conversation. Call the tools for any calculation instead of working it out yourself. If a tool returns an error, explain the error plainly.

Never say or imply that this app, or anything computed with it, is safe for real keys or secrets: it is a teaching tool and is not hardened against attacks such as timing measurements.

Write for a graduate student who learned the hand method in class. Be brief: a few sentences or a short list. Use plain text with **bold** and \`code\` only; no headings, tables or HTML. Write points as (x, y) and the point at infinity as O.`;

/** The outcome of one question. */
export type AssistantOutcome =
  { kind: 'answer'; text: string } | { kind: 'declined'; text: string };

/** How the page should treat a provider failure. */
export interface FailureNotice {
  /** A short reason, safe to show (never the provider's own error text). */
  reason: string;
  /** True for limits on the provider's side: the offline helper answers with no warning. */
  quiet: boolean;
}

/** One AI provider, as the route sees it. */
export interface AssistantProvider {
  /** The company that receives the questions, for the page and the start-up message. */
  name: 'OpenAI' | 'Anthropic';
  /** The model, as shown to users. */
  model: string;
  /**
   * Answer one question.
   *
   * @param history - earlier turns, oldest first, as plain text.
   * @param question - the new question.
   * @param context - a short description of the user's current work, if any.
   * @returns the answer text, or a polite refusal.
   * @throws the SDK's errors, which the route turns into a fallback to the offline helper.
   */
  ask(history: ChatTurn[], question: string, context: string): Promise<AssistantOutcome>;
  /**
   * Classify a failure from {@link ask}.
   *
   * @param error - what was thrown.
   * @returns the reason to show and whether to stay quiet.
   */
  explainFailure(error: unknown): FailureNotice;
}

/**
 * The text of the new user message, with the user's current work in front when there is any.
 *
 * @param question - the question.
 * @param context - a short description of the current work, or an empty string.
 * @returns the message text.
 */
export function questionText(question: string, context: string): string {
  const intro = context ? `My current work in OnCurve: ${context}\n\nMy question: ` : '';
  return `${intro}${question}`;
}

/**
 * Turn the model's final text into the answer for the page.
 *
 * Edge cases: an empty text becomes a request to rephrase, an over-long one is cut to
 * {@link MAX_ANSWER_LENGTH}, and an answer stopped by the token limit says so.
 *
 * @param text - the model's text.
 * @param cutShort - true when the model ran out of tokens.
 * @returns the finished outcome.
 */
export function finishAnswer(text: string, cutShort: boolean): AssistantOutcome {
  const body = text.trim() || 'I could not form an answer. Please rephrase the question.';
  const cut = cutShort ? '\n\n(The answer was cut short.)' : '';
  return { kind: 'answer', text: body.slice(0, MAX_ANSWER_LENGTH) + cut };
}
