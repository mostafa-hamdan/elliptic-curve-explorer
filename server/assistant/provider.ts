/**
 * Chooses the assistant's AI provider from the settings. Only the provider named by
 * AI_PROVIDER is ever contacted: a missing key turns AI mode off instead of quietly sending
 * the questions to the other company.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ServerConfig } from '../config.ts';
import { anthropicProvider } from './anthropic.ts';
import { OPENAI_BASE_URL, openAiProvider } from './openai.ts';
import type { AssistantProvider } from './run.ts';

/** How long one request to a provider may take, in milliseconds. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Build the provider the settings ask for.
 *
 * @param config - the server settings.
 * @returns the provider, or null when AI mode is off (no key, or an unknown AI_PROVIDER).
 */
export function createAssistantProvider(config: ServerConfig): AssistantProvider | null {
  if (config.aiProvider === 'anthropic' && config.anthropicApiKey) {
    return anthropicProvider(
      new Anthropic({
        apiKey: config.anthropicApiKey,
        maxRetries: 1,
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );
  }
  if (config.aiProvider === 'openai' && config.openaiApiKey) {
    return openAiProvider(
      new OpenAI({
        apiKey: config.openaiApiKey,
        baseURL: OPENAI_BASE_URL,
        // No retries: a rate limit or an empty budget goes to the offline helper at once,
        // instead of keeping the student waiting.
        maxRetries: 0,
        timeout: REQUEST_TIMEOUT_MS,
      }),
      config.openaiModel,
    );
  }
  return null;
}

/**
 * One line for the start-up window saying where assistant questions go.
 *
 * @param config - the server settings.
 * @returns the message.
 */
export function describeAiSetup(config: ServerConfig): string {
  if (config.aiProvider === null) {
    return 'AI_PROVIDER in .env must be "openai" or "anthropic"; the assistant uses its offline helper.';
  }
  if (config.aiProvider === 'anthropic') {
    return config.anthropicApiKey
      ? `The assistant's AI mode sends questions to Anthropic (at most ${config.aiDailyLimit} a day).`
      : 'The assistant uses its offline helper (no ANTHROPIC_API_KEY in .env).';
  }
  return config.openaiApiKey
    ? `The assistant's AI mode sends questions to OpenAI, model ${config.openaiModel} (at most ${config.aiDailyLimit} a day).`
    : 'The assistant uses its offline helper (no OPENAI_API_KEY in .env).';
}
