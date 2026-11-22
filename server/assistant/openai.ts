/**
 * The assistant's AI mode through OpenAI: every request is POST /v1/responses (the Responses
 * API) with function calling. It runs the engine-backed tools the model asks for and
 * returns the final answer. Used when AI_PROVIDER=openai. The key stays on the server.
 */
import OpenAI from 'openai';
import {
  DECLINED_TEXT,
  finishAnswer,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_ROUNDS,
  questionText,
  SYSTEM_PROMPT,
  TOO_MANY_ROUNDS_TEXT,
  type AssistantOutcome,
  type AssistantProvider,
  type ChatTurn,
  type FailureNotice,
} from './run.ts';
import { openAiTools, runAssistantTool } from './tools.ts';

/** The model used unless OPENAI_MODEL says otherwise. */
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';

/**
 * The API address, set explicitly: otherwise the SDK would obey an OPENAI_BASE_URL variable
 * on the computer, which could send the key and the questions somewhere else.
 */
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** Error codes that mean "no budget" or "this model is not allowed for this key". */
const QUIET_CODES = new Set([
  'insufficient_quota',
  'billing_hard_limit_reached',
  'billing_not_active',
  'rate_limit_exceeded',
  'model_not_found',
  'model_not_allowed',
  'model_not_available',
]);

/** The short, neutral reason shown in the panel's header after a quiet fallback. */
const QUIET_REASON = 'AI mode is unavailable right now.';

/** The part of the SDK client this module uses (so tests can pass a stand-in). */
export interface OpenAiClient {
  responses: {
    create(
      params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
    ): Promise<OpenAI.Responses.Response>;
  };
}

/** A response the API delivered with the status "failed" instead of an HTTP error. */
export class OpenAiResponseError extends Error {
  /**
   * @param code - the API's error code, if it gave one.
   */
  constructor(readonly code: string | undefined) {
    super('The model could not finish this response.');
    this.name = 'OpenAiResponseError';
  }
}

/** Output items that must go back to the API on the next turn. */
type ReplayItem =
  | OpenAI.Responses.ResponseReasoningItem
  | OpenAI.Responses.ResponseFunctionToolCall
  | OpenAI.Responses.ResponseOutputMessage;

/** Is this an output item to send back (reasoning, tool call or message)? */
function isReplayItem(item: OpenAI.Responses.ResponseOutputItem): item is ReplayItem {
  return item.type === 'reasoning' || item.type === 'function_call' || item.type === 'message';
}

/**
 * Read a tool call's arguments, which the API delivers as JSON text.
 *
 * @param text - the arguments.
 * @returns the parsed value, or null when it is not valid JSON; the tool then reports a
 *          missing argument to the model instead of crashing.
 */
function parseArguments(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Answer one question through the Responses API.
 *
 * Nothing is stored at OpenAI between turns (`store: false`), so each request carries the
 * whole exchange, including the model's reasoning items from the previous tool call.
 *
 * @param client - the API client (or a stand-in in tests).
 * @param model - the model name.
 * @param history - earlier turns, oldest first, as plain text.
 * @param question - the new question.
 * @param context - a short description of the user's current work, if any.
 * @returns the answer text, or a polite refusal.
 * @throws the SDK's errors, or {@link OpenAiResponseError} for a failed response.
 */
export async function askOpenAi(
  client: OpenAiClient,
  model: string,
  history: ChatTurn[],
  question: string,
  context: string,
): Promise<AssistantOutcome> {
  const input: OpenAI.Responses.ResponseInputItem[] = [
    ...history.map((turn): OpenAI.Responses.EasyInputMessage => ({
      role: turn.role,
      content: turn.text,
    })),
    { role: 'user', content: questionText(question, context) },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.responses.create({
      model,
      instructions: SYSTEM_PROMPT,
      input,
      tools: openAiTools(),
      reasoning: { effort: 'minimal' },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
      include: ['reasoning.encrypted_content'],
    });

    if (response.status === 'failed') throw new OpenAiResponseError(response.error?.code);
    if (response.incomplete_details?.reason === 'content_filter') {
      return { kind: 'declined', text: DECLINED_TEXT };
    }

    const parts = response.output.flatMap((item) => (item.type === 'message' ? item.content : []));
    if (parts.some((part) => part.type === 'refusal')) {
      return { kind: 'declined', text: DECLINED_TEXT };
    }

    const toolCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call',
    );
    // A response cut off by the token limit may end in an unfinished tool call: stop there.
    if (toolCalls.length === 0 || response.status === 'incomplete') {
      const text = parts
        .flatMap((part) => (part.type === 'output_text' ? [part.text] : []))
        .join('\n');
      return finishAnswer(text, response.incomplete_details?.reason === 'max_output_tokens');
    }

    // Send back what the model produced, then one output for each of its tool calls.
    input.push(...response.output.filter(isReplayItem));
    for (const call of toolCalls) {
      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: runAssistantTool(call.name, parseArguments(call.arguments)),
      });
    }
  }

  return { kind: 'answer', text: TOO_MANY_ROUNDS_TEXT };
}

/**
 * Classify a failure. A rate limit, an exhausted budget or a model the key may not use is
 * not something a student can act on, so the offline helper simply takes over.
 *
 * @param error - what was thrown.
 * @returns the reason to show and whether to stay quiet. Never the provider's own text.
 */
export function explainOpenAiFailure(error: unknown): FailureNotice {
  if (error instanceof OpenAiResponseError) {
    return error.code !== undefined && QUIET_CODES.has(error.code)
      ? { reason: QUIET_REASON, quiet: true }
      : { reason: 'The AI service did not answer.', quiet: false };
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return { reason: 'The AI service cannot be reached (no internet?).', quiet: false };
  }
  if (error instanceof OpenAI.APIError) {
    const code = typeof error.code === 'string' ? error.code : '';
    if (
      QUIET_CODES.has(code) ||
      error.status === 402 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status === 429
    ) {
      return { reason: QUIET_REASON, quiet: true };
    }
    if (error.status === 401) {
      return { reason: 'The AI key on this server is not accepted.', quiet: false };
    }
  }
  return { reason: 'The AI service did not answer.', quiet: false };
}

/**
 * Wrap a client as an assistant provider.
 *
 * @param client - the API client (or a stand-in in tests).
 * @param model - the model name.
 * @returns the provider.
 */
export function openAiProvider(
  client: OpenAiClient,
  model: string = DEFAULT_OPENAI_MODEL,
): AssistantProvider {
  return {
    name: 'OpenAI',
    model,
    ask: (history, question, context) => askOpenAi(client, model, history, question, context),
    explainFailure: explainOpenAiFailure,
  };
}
