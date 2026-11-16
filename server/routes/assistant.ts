/**
 * Assistant routes. The status route tells the page whether AI mode can be used right
 * now (a server key is set and the user is signed in); otherwise the page uses the
 * offline helper, which needs neither.
 */
import type { FastifyInstance } from 'fastify';

/** Register the assistant routes. */
export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  const { config } = app.ctx;

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
      if (!config.anthropicApiKey) {
        return { ai: false, reason: 'AI mode is not set up on this server.' };
      }
      if (!request.auth) return { ai: false, reason: 'Sign in to use AI mode.' };
      return { ai: true, reason: 'AI mode is ready.' };
    },
  );
}
