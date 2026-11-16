/**
 * Assistant routes. The status route tells the page whether AI mode can be used right
 * now (a server key is set and the user is signed in). The question route answers in AI
 * mode; whenever that is not possible (no key, no internet, the hourly limit reached, an
 * error at the provider) it answers `{ fallback }`, and the page uses the offline helper,
 * which needs neither a key nor a network.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { FastifyInstance } from 'fastify';
import { askAssistant, type ChatTurn } from '../assistant/run.ts';
import { describeWait, hitRateLimit } from '../security/rateLimit.ts';
import { fail, requireAuth } from './shared.ts';

/** AI messages allowed per user per hour. */
export const AI_MESSAGES_PER_HOUR = 20;
/** Longest question accepted, in characters (the same as the page's limit). */
export const MAX_QUESTION_LENGTH = 500;

/**
 * A short reason for falling back, from an SDK error. Typed error classes are used, never
 * the error text, which is not meant for users.
 */
function fallbackReason(error: unknown): string {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return 'The AI key on this server is not accepted.';
  }
  if (error instanceof Anthropic.RateLimitError) return 'The AI service is busy right now.';
  if (error instanceof Anthropic.APIConnectionError)
    return 'The AI service cannot be reached (no internet?).';
  return 'The AI service did not answer.';
}

/** Register the assistant routes. */
export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get(
    '/api/assistant/status',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: { ai: { type: 'boolean' }, reason: { type: 'string' } },
            required: ['ai', 'reason'],
            additionalProperties: false,
          },
        },
      },
    },
    async (request) => {
      if (!app.ctx.ai) return { ai: false, reason: 'AI mode is not set up on this server.' };
      if (!request.auth) return { ai: false, reason: 'Sign in to use AI mode.' };
      return { ai: true, reason: 'AI mode is ready.' };
    },
  );

  app.post<{ Body: { question: string; history: ChatTurn[]; context: string } }>(
    '/api/assistant',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            question: { type: 'string', minLength: 1, maxLength: MAX_QUESTION_LENGTH },
            history: {
              type: 'array',
              maxItems: 10,
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  text: { type: 'string', minLength: 1, maxLength: 6000 },
                },
                required: ['role', 'text'],
                additionalProperties: false,
              },
            },
            context: { type: 'string', maxLength: 1000 },
          },
          required: ['question', 'history', 'context'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      const client = app.ctx.ai;
      if (!client) return { fallback: 'AI mode is not set up on this server.' };
      if (request.body.question.trim() === '') return fail(reply, 400, 'Type a question first.');

      const limit = await hitRateLimit(
        db,
        `ai:${auth.user.id}`,
        AI_MESSAGES_PER_HOUR,
        60 * 60 * 1000,
      );
      if (!limit.allowed) {
        return {
          fallback: `You have used your ${AI_MESSAGES_PER_HOUR} AI questions for this hour (more in ${describeWait(limit.retryAfterMs)}).`,
        };
      }

      try {
        const outcome = await askAssistant(
          client,
          request.body.history,
          request.body.question.trim(),
          request.body.context,
        );
        return { answer: outcome.text, declined: outcome.kind === 'declined' };
      } catch (error) {
        request.log.warn(
          { err: error },
          'AI mode failed; the page falls back to the offline helper',
        );
        return { fallback: fallbackReason(error) };
      }
    },
  );
}
