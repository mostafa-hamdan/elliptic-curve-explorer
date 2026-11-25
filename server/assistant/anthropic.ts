/**
 * The assistant's AI mode through Anthropic's Messages API: sends the question with the
 * engine-backed tools, runs the tools the model asks for, checks the final answer against
 * their results, and returns it.
 * Used when AI_PROVIDER=anthropic. The key stays on the server.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AnswerCheck } from './numberCheck.ts';
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
import { anthropicTools, runAssistantTool } from './tools.ts';

/** The model named in the project specification. */
export const ANTHROPIC_MODEL = 'claude-haiku-5-5';

/** The part of the SDK client this module uses (so tests can pass a stand-in). */
export interface AnthropicClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

/**
 * Answer one question through the Messages API.
 *
 * @param client - the API client (or a stand-in in tests).
 * @param history - earlier turns, oldest first, as plain text.
 * @param question - the new question.
 * @param context - a short description of the user's current work, if any.
 * @returns the answer text, or a polite refusal.
 * @throws the SDK's errors (network, key, rate limit), or UnverifiedAnswerError when the
 *         answer fails the number check twice.
 */
export async function askAnthropic(
  client: AnthropicClient,
  history: ChatTurn[],
  question: string,
  context: string,
): Promise<AssistantOutcome> {
  const check = new AnswerCheck(history, question, context);
  const messages: Anthropic.MessageParam[] = [
    ...history.map((turn): Anthropic.MessageParam => ({ role: turn.role, content: turn.text })),
    { role: 'user', content: questionText(question, context) },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      // Short chat answers: low effort keeps them quick; thinking stays adaptive.
      output_config: { effort: 'low' },
      tools: anthropicTools(),
      messages,
    });

    if (response.stop_reason === 'refusal') return { kind: 'declined', text: DECLINED_TEXT };

    const toolCalls = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (response.stop_reason !== 'tool_use' || toolCalls.length === 0) {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
      const reminder = check.review(text);
      if (reminder === null) return finishAnswer(text, response.stop_reason === 'max_tokens');
      // One more try: keep the model's answer in the exchange and point out what is wrong.
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: reminder });
      continue;
    }

    // Keep the whole assistant turn (thinking blocks included) and answer every tool call
    // in one user message, as the API expects.
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: toolCalls.map((call): Anthropic.ToolResultBlockParam => {
        const output = runAssistantTool(call.name, call.input);
        check.addToolResult(output);
        return { type: 'tool_result', tool_use_id: call.id, content: output };
      }),
    });
  }

  return { kind: 'answer', text: TOO_MANY_ROUNDS_TEXT };
}

/**
 * A short reason for falling back, from an SDK error. Typed error classes are used, never
 * the error text, which is not meant for users.
 *
 * @param error - what the SDK threw.
 * @returns the reason to show.
 */
export function explainAnthropicFailure(error: unknown): FailureNotice {
  let reason = 'The AI service did not answer.';
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    reason = 'The AI key on this server is not accepted.';
  } else if (error instanceof Anthropic.RateLimitError) {
    reason = 'The AI service is busy right now.';
  } else if (error instanceof Anthropic.APIConnectionError) {
    reason = 'The AI service cannot be reached (no internet?).';
  }
  return { reason, quiet: false };
}

/**
 * Wrap a client as an assistant provider.
 *
 * @param client - the API client (or a stand-in in tests).
 * @returns the provider.
 */
export function anthropicProvider(client: AnthropicClient): AssistantProvider {
  return {
    name: 'Anthropic',
    model: 'Claude Haiku 5.5',
    ask: (history, question, context) => askAnthropic(client, history, question, context),
    explainFailure: explainAnthropicFailure,
  };
}
