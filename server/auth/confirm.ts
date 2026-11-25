/**
 * Proof that the person at the keyboard owns the account, for sensitive actions: changing
 * the password, turning two-factor authentication off, making new recovery codes and
 * deleting the account. They all need the password and, when 2FA is on, a current code from
 * the authenticator app or one recovery code. Wrong attempts are limited per account, so a
 * stolen session cannot be used to guess the code.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { recoveryCodes, users } from '../db/schema.ts';
import { keyedHash, normalizeRecoveryCode, open } from '../security/crypto.ts';
import { verifyPassword } from '../security/passwords.ts';
import {
  clearRateLimit,
  describeWait,
  hitRateLimit,
  rateLimitBlocked,
} from '../security/rateLimit.ts';
import { checkTotp } from '../security/totp.ts';
import { fail } from '../routes/shared.ts';
import type { User } from './sessions.ts';

/** Wrong passwords or codes allowed per account in {@link CONFIRM_WINDOW_MS}. */
export const CONFIRM_FAILURES_ALLOWED = 5;
/** The window for {@link CONFIRM_FAILURES_ALLOWED}. */
export const CONFIRM_WINDOW_MS = 15 * 60 * 1000;

/** Shown when 2FA is on and no code was given. */
export const CODE_NEEDED =
  'Type the code from your authenticator app (or a recovery code) to confirm.';

/**
 * Use up one recovery code if it matches an unused code of the account.
 *
 * @param app - the server.
 * @param userId - the account.
 * @param code - the code as typed (spaces, dashes and case do not matter).
 * @returns true when a code was accepted (and is now marked as used).
 */
export async function useRecoveryCode(
  app: FastifyInstance,
  userId: number,
  code: string,
): Promise<boolean> {
  const { db, config } = app.ctx;
  const codeHash = keyedHash(config.sessionSecret, normalizeRecoveryCode(code));
  const updated = await db
    .update(recoveryCodes)
    .set({ usedAt: Date.now() })
    .where(
      and(
        eq(recoveryCodes.userId, userId),
        eq(recoveryCodes.codeHash, codeHash),
        isNull(recoveryCodes.usedAt),
      ),
    )
    .returning({ id: recoveryCodes.id });
  return updated.length === 1;
}

/**
 * Check a second-factor code: a 6-digit authenticator code (each one works only once), or
 * one of the recovery codes (which is then used up).
 *
 * @param app - the server.
 * @param user - the account, with 2FA on.
 * @param code - the code as typed.
 * @returns 'totp' or 'recovery' when accepted, null when not.
 */
export async function checkSecondFactor(
  app: FastifyInstance,
  user: User,
  code: string,
): Promise<'totp' | 'recovery' | null> {
  const { db, config } = app.ctx;
  if (/^\s*\d{3}\s?\d{3}\s*$/.test(code) && user.totpSecret) {
    const step = checkTotp(open(config.sessionSecret, user.totpSecret), code, user.totpLastStep);
    if (step === null) return null;
    await db.update(users).set({ totpLastStep: step }).where(eq(users.id, user.id));
    return 'totp';
  }
  return (await useRecoveryCode(app, user.id, code)) ? 'recovery' : null;
}

/**
 * Confirm a sensitive action: the password, and the second factor when 2FA is on.
 * Sends the refusal itself, so the route only has to stop when this returns false.
 *
 * @param app - the server.
 * @param reply - the reply, for the refusal.
 * @param user - the signed-in account.
 * @param password - the password as typed.
 * @param code - the 2FA or recovery code as typed, if any.
 * @param wrongPassword - the message for a wrong password.
 * @returns true when the action may go ahead.
 */
export async function confirmIdentity(
  app: FastifyInstance,
  reply: FastifyReply,
  user: User,
  password: string,
  code: string | undefined,
  wrongPassword = 'Your password is not right.',
): Promise<boolean> {
  const { db } = app.ctx;
  const key = `confirm-account:${user.id}`;
  const blocked = await rateLimitBlocked(db, key, CONFIRM_FAILURES_ALLOWED, CONFIRM_WINDOW_MS);
  if (blocked !== null) {
    fail(reply, 429, `Too many wrong attempts. Try again in ${describeWait(blocked)}.`);
    return false;
  }

  const refuse = async (message: string) => {
    await hitRateLimit(db, key, Number.MAX_SAFE_INTEGER, CONFIRM_WINDOW_MS);
    fail(reply, 400, message);
    return false;
  };

  if (!(await verifyPassword(user.passwordHash, password))) {
    return refuse(wrongPassword);
  }
  if (user.totpSecret) {
    const typed = code?.trim() ?? '';
    // A missing code is not a guess, so it does not count as a wrong attempt.
    if (typed === '') {
      fail(reply, 400, CODE_NEEDED);
      return false;
    }
    if (!(await checkSecondFactor(app, user, typed))) {
      return refuse(
        'That code is not right. Use the current code from your app, or a recovery code.',
      );
    }
  }
  await clearRateLimit(db, key);
  return true;
}
