/**
 * Security-center routes: the list of signed-in browsers (and ending one remotely), the
 * recent security events, and deleting the account with all of its data. Every query is
 * filtered by the signed-in user's id.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  activity,
  history,
  recoveryCodes,
  savedItems,
  sessions,
  settings,
  users,
} from '../db/schema.ts';
import { cookieOptions, issueCsrfToken, SESSION_COOKIE } from '../auth/sessions.ts';
import { confirmIdentity } from '../auth/confirm.ts';
import { isLockedDemo, refuseDemoChange } from '../demo.ts';
import { codeSchema, fail, passwordSchema, requireAuth } from './shared.ts';

/** How many security events the Security center shows. */
const ACTIVITY_SHOWN = 20;

/** Register the Security-center routes. */
export async function accountRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;

  app.get('/api/account/sessions', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return reply;
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, auth.user.id))
      .orderBy(desc(sessions.lastSeenAt));
    // Visitors who share the demo account see only their own browser, not each other's.
    const shown = isLockedDemo(config, auth.user.email)
      ? rows.filter((row) => row.tokenHash === auth.tokenHash)
      : rows;
    return {
      sessions: shown.map((row) => ({
        id: row.publicId,
        device: row.device,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        current: row.tokenHash === auth.tokenHash,
      })),
    };
  });

  app.delete<{ Params: { id: string } }>(
    '/api/account/sessions/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      // On the shared demo account a visitor may end only their own session.
      if (isLockedDemo(config, auth.user.email)) {
        const own = await db
          .select({ tokenHash: sessions.tokenHash })
          .from(sessions)
          .where(eq(sessions.publicId, request.params.id));
        if (
          own[0]?.tokenHash !== auth.tokenHash &&
          refuseDemoChange(config, reply, auth.user.email)
        ) {
          return reply;
        }
      }
      // The user id in the condition means one account can never end another's session.
      const removed = await db
        .delete(sessions)
        .where(and(eq(sessions.publicId, request.params.id), eq(sessions.userId, auth.user.id)))
        .returning({ tokenHash: sessions.tokenHash });
      if (removed.length === 0) return fail(reply, 404, 'That session has already ended.');
      if (removed[0]!.tokenHash === auth.tokenHash) {
        reply.clearCookie(SESSION_COOKIE, cookieOptions(config, 0));
      }
      return { ok: true };
    },
  );

  app.get('/api/account/activity', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return reply;
    const rows = await db
      .select({ event: activity.event, device: activity.device, at: activity.at })
      .from(activity)
      .where(eq(activity.userId, auth.user.id))
      .orderBy(desc(activity.at), desc(activity.id))
      .limit(ACTIVITY_SHOWN);
    return { activity: rows };
  });

  app.post<{ Body: { password: string; code?: string } }>(
    '/api/account/delete',
    {
      schema: {
        body: {
          type: 'object',
          properties: { password: passwordSchema, code: codeSchema },
          required: ['password'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      const user = auth.user;
      if (refuseDemoChange(config, reply, user.email)) return reply;
      if (!(await confirmIdentity(app, reply, user, request.body.password, request.body.code))) {
        return reply;
      }
      // Every table is cleared explicitly, so nothing is left behind even if the database
      // has foreign-key enforcement switched off.
      for (const table of [history, savedItems, settings, activity, recoveryCodes, sessions]) {
        await db.delete(table).where(eq(table.userId, user.id));
      }
      await db.delete(users).where(eq(users.id, user.id));
      reply.clearCookie(SESSION_COOKIE, cookieOptions(config, 0));
      return { ok: true, csrfToken: issueCsrfToken(config, reply) };
    },
  );
}
