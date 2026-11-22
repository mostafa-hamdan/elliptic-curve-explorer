/**
 * Assistant routes. The status route tells the page whether AI mode can be used right now
 * and which provider would receive the questions. The question route answers in AI mode;
 * whenever that is not possible (no key, no internet, the hourly or daily limit reached, an
 * error at the provider) it answers `{ fallback }`, and the page uses the offline helper,
 * which needs neither a key nor a network.
 */
import type { FastifyInstance } from 'fastify';
import {
  countDailyQuestion,
  DAILY_LIMIT_NOTICE,
  dailyLimitReached,
} from '../assistant/dailyLimit.ts';
import type { ChatTurn } from '../assistant/run.ts';
import { describeWait, hitRateLimit } from '../security/rateLimit.ts';
import { fail, requireAuth } from './shared.ts';

/** AI messages allowed per user per hour. */
export const AI_MESSAGES_PER_HOUR = 20;
/** Longest question accepted, in characters (the same as the page's limit). */
export const MAX_QUESTION_LENGTH = 500;

/** Register the assistant routes. */
export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;

  app.get(
    '/api/assistant/status',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              ai: { type: 'boolean' },
              reason: { type: 'string' },
              provider: { type: 'string' },
              model: { type: 'string' },
            },
            required: ['ai', 'reason'],
            additionalProperties: false,
          },
        },
      },
    },
    async (request) => {
      const provider = app.ctx.ai;
      if (!provider) return { ai: false, reason: 'AI mode is not set up on this server.' };
      const who = { provider: provider.name, model: provider.model };
      if (await dailyLimitReached(db, config.aiDailyLimit)) {
        return { ai: false, reason: DAILY_LIMIT_NOTICE, ...who };
      }
      if (!request.auth) return { ai: false, reason: 'Sign in to use AI mode.', ...who };
      return { ai: true, reason: 'AI mode is ready.', ...who };
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
      const provider = app.ctx.ai;
      if (!provider) return { fallback: 'AI mode is not set up on this server.' };
      if (request.body.question.trim() === '') return fail(reply, 400, 'Type a question first.');

      // Look before counting, so a day that is already full costs nobody an hourly question.
      if (await dailyLimitReached(db, config.aiDailyLimit)) {
        return { fallback: DAILY_LIMIT_NOTICE, aiOff: true };
      }

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

      // Counted before the call, so a question that fails half way still counts: it may
      // already have cost money.
      if (!(await countDailyQuestion(db, config.aiDailyLimit))) {
        return { fallback: DAILY_LIMIT_NOTICE, aiOff: true };
      }

      try {
        const outcome = await provider.ask(
          request.body.history,
          request.body.question.trim(),
          request.body.context,
        );
        return { answer: outcome.text, declined: outcome.kind === 'declined' };
      } catch (error) {
        const failure = provider.explainFailure(error);
        // Only the status and code are logged: an SDK error object also carries headers.
        const { status, code } = error as { status?: unknown; code?: unknown };
        request.log.info(
          { provider: provider.name, status, code },
          'AI mode failed; the page falls back to the offline helper',
        );
        return failure.quiet
          ? { fallback: failure.reason, quiet: true }
          : { fallback: failure.reason };
      }
    },
  );
}
