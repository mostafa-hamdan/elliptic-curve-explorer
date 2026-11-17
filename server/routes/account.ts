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
import { checkTotp } from '../security/totp.ts';
import { keyedHash, normalizeRecoveryCode, open } from '../security/crypto.ts';
import { verifyPassword } from '../security/passwords.ts';
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
    return {
      sessions: rows.map((row) => ({
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
      if (!(await verifyPassword(user.passwordHash, request.body.password))) {
        return fail(reply, 400, 'Your password is not right.');
      }
      if (user.totpSecret) {
        const code = request.body.code?.trim() ?? '';
        const totpOk =
          /^\d{6}$/.test(code) &&
          checkTotp(open(config.sessionSecret, user.totpSecret), code, user.totpLastStep) !== null;
        const recoveryOk =
          !totpOk &&
          (
            await db
              .select({ id: recoveryCodes.id })
              .from(recoveryCodes)
              .where(
                and(
                  eq(recoveryCodes.userId, user.id),
                  eq(
                    recoveryCodes.codeHash,
                    keyedHash(config.sessionSecret, normalizeRecoveryCode(code)),
                  ),
                ),
              )
          ).length > 0;
        if (!totpOk && !recoveryOk) {
          return fail(
            reply,
            400,
            'Type the code from your authenticator app (or a recovery code) to confirm.',
          );
        }
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
