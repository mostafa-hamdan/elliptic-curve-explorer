/**
 * Pieces shared by the API routes: the request and server additions that TypeScript
 * should know about, reusable JSON schemas, and small helpers for common answers.
 */
import { eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServerConfig } from '../config.ts';
import type { Database } from '../db/client.ts';
import { recoveryCodes } from '../db/schema.ts';
import type { AssistantProvider } from '../assistant/run.ts';
import type { Auth } from '../auth/sessions.ts';
import { keyedHash, normalizeRecoveryCode, recoveryCode } from '../security/crypto.ts';

declare module 'fastify' {
  interface FastifyInstance {
    /** The database, the settings and the AI provider (null without a key), for every route. */
    ctx: { db: Database; config: ServerConfig; ai: AssistantProvider | null };
  }
  interface FastifyRequest {
    /** Who is signed in, or null; filled in before every API route runs. */
    auth: Auth | null;
  }
}

/** JSON schema for an email address used as the sign-in name. */
export const emailSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 254,
  pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
} as const;

/** JSON schema for a password as received (the rules are checked separately). */
export const passwordSchema = { type: 'string', minLength: 1, maxLength: 256 } as const;

/** JSON schema for a 6-digit authenticator code or a recovery code. */
export const codeSchema = { type: 'string', minLength: 6, maxLength: 20 } as const;

/** The standard error reply: `{ "error": "message" }`. */
export const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
} as const;

/** Reply with an error message the screen can show as it is. */
export function fail(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ error: message });
}

/**
 * The signed-in user of a request, or an error reply when nobody is signed in.
 *
 * @param request - the request.
 * @param reply - the reply, used for the error.
 * @returns the session, or null after sending a 401 reply.
 */
export function requireAuth(request: FastifyRequest, reply: FastifyReply): Auth | null {
  if (!request.auth) {
    void fail(reply, 401, 'Please sign in first.');
    return null;
  }
  return request.auth;
}

/** Normalize an email for storage and lookup. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** How many recovery codes an account gets. */
export const RECOVERY_CODE_COUNT = 10;

/**
 * Replace a user's recovery codes with ten new ones.
 *
 * @param db - the database.
 * @param config - server settings (for the hashing key).
 * @param userId - the account.
 * @returns the new codes, to show once. Only their hashes are stored.
 */
export async function newRecoveryCodes(
  db: Database,
  config: ServerConfig,
  userId: number,
): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => recoveryCode());
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  await db.insert(recoveryCodes).values(
    codes.map((code) => ({
      userId,
      codeHash: keyedHash(config.sessionSecret, normalizeRecoveryCode(code)),
      usedAt: null,
    })),
  );
  return codes;
}
