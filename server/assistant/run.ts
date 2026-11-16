/**
 * The AI mode of the assistant: sends the question to Claude Haiku 5.5 together with the
 * engine-backed tools, runs the tools it asks for, and returns the final answer. The key
 * stays on the server; the browser only ever sees the answer text.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { ASSISTANT_TOOLS, runAssistantTool } from './tools.ts';

/** The model named in the project specification. */
export const ASSISTANT_MODEL = 'claude-haiku-5-5';
/** Most tool rounds in one answer; a normal answer needs one to three. */
const MAX_TOOL_ROUNDS = 6;
/** Longest answer passed on to the page. */
export const MAX_ANSWER_LENGTH = 6000;

/** The part of the SDK client this module uses (so tests can pass a stand-in). */
export interface AssistantClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

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

/**
 * Answer one question in AI mode.
 *
 * @param client - the Claude API client (or a stand-in in tests).
 * @param history - earlier turns, oldest first, as plain text.
 * @param question - the new question.
 * @param context - a short description of the user's current work, if any.
 * @returns the answer text, or a polite refusal.
 * @throws the SDK's errors (network, key, rate limit), which the route turns into a
 *         fallback to the offline helper.
 */
export async function askAssistant(
  client: AssistantClient,
  history: ChatTurn[],
  question: string,
  context: string,
): Promise<AssistantOutcome> {
  const intro = context ? `My current work in OnCurve: ${context}\n\nMy question: ` : '';
  const messages: Anthropic.MessageParam[] = [
    ...history.map((turn): Anthropic.MessageParam => ({ role: turn.role, content: turn.text })),
    { role: 'user', content: `${intro}${question}` },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      // Short chat answers: low effort keeps them quick; thinking stays adaptive.
      output_config: { effort: 'low' },
      tools: ASSISTANT_TOOLS,
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return {
        kind: 'declined',
        text: 'I cannot help with that request. Ask me about elliptic curves or this app instead.',
      };
    }

    const toolCalls = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (response.stop_reason !== 'tool_use' || toolCalls.length === 0) {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      const cut = response.stop_reason === 'max_tokens' ? '\n\n(The answer was cut short.)' : '';
      return {
        kind: 'answer',
        text:
          (text || 'I could not form an answer. Please rephrase the question.').slice(
            0,
            MAX_ANSWER_LENGTH,
          ) + cut,
      };
    }

    // Keep the whole assistant turn (thinking blocks included) and answer every tool call
    // in one user message, as the API expects.
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: toolCalls.map((call): Anthropic.ToolResultBlockParam => ({
        type: 'tool_result',
        tool_use_id: call.id,
        content: runAssistantTool(call.name, call.input),
      })),
    });
  }

  return {
    kind: 'answer',
    text: 'That needed too many calculations for one answer. Try asking about one step at a time.',
  };
}
