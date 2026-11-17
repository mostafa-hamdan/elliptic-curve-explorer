/**
 * Account routes: sign-up, sign-in (with the second factor when it is on), sign-out,
 * resetting a lost password with a recovery code, changing the password, and turning
 * two-factor authentication on and off. Every body is checked against a JSON schema
 * before the handler runs, and every attempt that could be guessed is rate-limited.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { checkPassword } from '../../shared/passwordRules.ts';
import { activity, recoveryCodes, sessions, users } from '../db/schema.ts';
import {
  CSRF_COOKIE,
  cookieOptions,
  describeDevice,
  endSession,
  issueCsrfToken,
  SESSION_COOKIE,
  startSession,
  type User,
} from '../auth/sessions.ts';
import { keyedHash, normalizeRecoveryCode, open, seal } from '../security/crypto.ts';
import { getDecoyHash, hashPassword, verifyPassword } from '../security/passwords.ts';
import {
  clearRateLimit,
  describeWait,
  hitRateLimit,
  rateLimitBlocked,
} from '../security/rateLimit.ts';
import { checkTotp, createTotpSecret } from '../security/totp.ts';
import {
  codeSchema,
  emailSchema,
  fail,
  newRecoveryCodes,
  normalizeEmail,
  passwordSchema,
  requireAuth,
} from './shared.ts';

/** Window for the sign-in and recovery limits. */
const WINDOW_MS = 15 * 60 * 1000;
/** Failed sign-ins allowed per account per window; then the account is locked for a while. */
const FAILURES_PER_ACCOUNT = 5;

/** One message for an unknown email and a wrong password, so neither is revealed. */
const WRONG_CREDENTIALS = 'Wrong email or password.';

/** The public view of an account, sent to the browser. Never includes any secret. */
export function publicUser(user: User) {
  return { email: user.email, twoFactor: user.totpSecret !== null, createdAt: user.createdAt };
}

const userSchema = {
  type: 'object',
  properties: {
    email: { type: 'string' },
    twoFactor: { type: 'boolean' },
    createdAt: { type: 'number' },
  },
  required: ['email', 'twoFactor', 'createdAt'],
  additionalProperties: false,
} as const;

/** Write a security event for the Security center. */
async function logActivity(
  app: FastifyInstance,
  request: FastifyRequest,
  userId: number,
  event: string,
): Promise<void> {
  await app.ctx.db.insert(activity).values({
    userId,
    event,
    device: describeDevice(request.headers['user-agent']),
    at: Date.now(),
  });
}

/**
 * Check a second-factor code: a 6-digit authenticator code, or one of the recovery codes
 * (which is then used up).
 *
 * @returns 'totp' or 'recovery' when accepted, null when not.
 */
async function checkSecondFactor(
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
 * Use up one recovery code if it matches an unused code of the account.
 *
 * @returns true when a code was accepted (and is now marked as used).
 */
async function useRecoveryCode(
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

/** Recovery codes an account has left. */
async function codesLeft(app: FastifyInstance, userId: number): Promise<number> {
  const rows = await app.ctx.db
    .select({ id: recoveryCodes.id })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  return rows.length;
}

/** Register the account routes. */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;

  app.get(
    '/api/auth/session',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              user: { anyOf: [userSchema, { type: 'null' }] },
              csrfToken: { type: 'string' },
              recoveryCodesLeft: { type: ['number', 'null'] },
            },
            required: ['user', 'csrfToken', 'recoveryCodesLeft'],
          },
        },
      },
    },
    async (request, reply) => {
      // Reuse the CSRF token the browser already has, or give it one.
      const csrfToken = request.cookies[CSRF_COOKIE] || issueCsrfToken(config, reply);
      const user = request.auth?.user ?? null;
      return {
        user: user ? publicUser(user) : null,
        csrfToken,
        recoveryCodesLeft: user ? await codesLeft(app, user.id) : null,
      };
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/api/auth/signup',
    {
      schema: {
        body: {
          type: 'object',
          properties: { email: emailSchema, password: passwordSchema },
          required: ['email', 'password'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const limit = await hitRateLimit(
        db,
        `signup-ip:${request.ip}`,
        config.signupsPerHour,
        60 * 60 * 1000,
      );
      if (!limit.allowed) {
        return fail(
          reply,
          429,
          `Too many new accounts from this network. Try again in ${describeWait(limit.retryAfterMs)}.`,
        );
      }
      const email = normalizeEmail(request.body.email);
      const check = checkPassword(request.body.password, email);
      if (check.problem) return fail(reply, 400, check.problem);

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (existing.length > 0) {
        return fail(reply, 409, 'An account with this email already exists. Sign in instead.');
      }
      const inserted = await db
        .insert(users)
        .values({
          email,
          passwordHash: await hashPassword(request.body.password),
          createdAt: Date.now(),
        })
        .returning();
      const user = inserted[0]!;
      const codes = await newRecoveryCodes(db, config, user.id);
      await logActivity(app, request, user.id, 'Account created');
      const csrfToken = await startSession(db, config, request, reply, user.id);
      return reply.code(201).send({ user: publicUser(user), csrfToken, recoveryCodes: codes });
    },
  );

  app.post<{ Body: { email: string; password: string; code?: string } }>(
    '/api/auth/signin',
    {
      schema: {
        body: {
          type: 'object',
          properties: { email: emailSchema, password: passwordSchema, code: codeSchema },
          required: ['email', 'password'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const accountKey = `signin-account:${email}`;

      const network = await hitRateLimit(
        db,
        `signin-ip:${request.ip}`,
        config.signinsPerWindow,
        WINDOW_MS,
      );
      if (!network.allowed) {
        return fail(
          reply,
          429,
          `Too many sign-in attempts from this network. Try again in ${describeWait(network.retryAfterMs)}.`,
        );
      }
      // A locked account (known or not, so locking reveals nothing) is checked before the
      // password, so guessing stops while it is locked.
      const locked = await rateLimitBlocked(db, accountKey, FAILURES_PER_ACCOUNT, WINDOW_MS);
      if (locked !== null) {
        return fail(
          reply,
          429,
          `Too many failed attempts for this account. Try again in ${describeWait(locked)}.`,
        );
      }

      const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = found[0];
      // Always run one Argon2 check, so an unknown email takes as long as a wrong password.
      const passwordOk = await verifyPassword(
        user?.passwordHash ?? (await getDecoyHash()),
        request.body.password,
      );
      if (!user || !passwordOk) {
        await hitRateLimit(db, accountKey, Number.MAX_SAFE_INTEGER, WINDOW_MS);
        return fail(reply, 401, WRONG_CREDENTIALS);
      }

      if (user.totpSecret) {
        const code = request.body.code?.trim();
        if (!code) return { status: 'second-factor' };
        const accepted = await checkSecondFactor(app, user, code);
        if (!accepted) {
          await hitRateLimit(db, accountKey, Number.MAX_SAFE_INTEGER, WINDOW_MS);
          return fail(
            reply,
            401,
            'That code is not right. Use the current code from your app, or a recovery code.',
          );
        }
        if (accepted === 'recovery')
          await logActivity(app, request, user.id, 'Used a recovery code to sign in');
      }

      await clearRateLimit(db, accountKey);
      const csrfToken = await startSession(db, config, request, reply, user.id);
      return { status: 'signed-in', user: publicUser(user), csrfToken };
    },
  );

  app.post('/api/auth/signout', async (request, reply) => {
    if (request.auth) await endSession(db, config, request.auth, reply);
    return { csrfToken: issueCsrfToken(config, reply) };
  });

  app.post('/api/auth/signout-all', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return reply;
    await db.delete(sessions).where(eq(sessions.userId, auth.user.id));
    await logActivity(app, request, auth.user.id, 'Signed out of all devices');
    reply.clearCookie(SESSION_COOKIE, cookieOptions(config, 0));
    return { csrfToken: issueCsrfToken(config, reply) };
  });

  app.post<{ Body: { email: string; recoveryCode: string; newPassword: string } }>(
    '/api/auth/recover',
    {
      schema: {
        body: {
          type: 'object',
          properties: { email: emailSchema, recoveryCode: codeSchema, newPassword: passwordSchema },
          required: ['email', 'recoveryCode', 'newPassword'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const network = await hitRateLimit(db, `recover-ip:${request.ip}`, 10, WINDOW_MS);
      const account = await hitRateLimit(db, `recover-account:${email}`, 5, WINDOW_MS);
      if (!network.allowed || !account.allowed) {
        const wait = Math.max(network.retryAfterMs, account.retryAfterMs);
        return fail(reply, 429, `Too many attempts. Try again in ${describeWait(wait)}.`);
      }
      const check = checkPassword(request.body.newPassword, email);
      if (check.problem) return fail(reply, 400, check.problem);

      const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = found[0];
      if (!user || !(await useRecoveryCode(app, user.id, request.body.recoveryCode))) {
        return fail(reply, 401, 'That email and recovery code do not match.');
      }
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(request.body.newPassword) })
        .where(eq(users.id, user.id));
      // Whoever knew the old password is signed out everywhere.
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await logActivity(app, request, user.id, 'Password reset with a recovery code');
      await clearRateLimit(db, `signin-account:${email}`);
      const csrfToken = await startSession(db, config, request, reply, user.id);
      return {
        user: publicUser(user),
        csrfToken,
        recoveryCodesLeft: await codesLeft(app, user.id),
      };
    },
  );

  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/api/auth/password',
    {
      schema: {
        body: {
          type: 'object',
          properties: { currentPassword: passwordSchema, newPassword: passwordSchema },
          required: ['currentPassword', 'newPassword'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      if (!(await verifyPassword(auth.user.passwordHash, request.body.currentPassword))) {
        return fail(reply, 400, 'Your current password is not right.');
      }
      const check = checkPassword(request.body.newPassword, auth.user.email);
      if (check.problem) return fail(reply, 400, check.problem);
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(request.body.newPassword) })
        .where(eq(users.id, auth.user.id));
      // Other browsers signed in with the old password are signed out; this one stays.
      const others = await db.select().from(sessions).where(eq(sessions.userId, auth.user.id));
      for (const session of others) {
        if (session.tokenHash !== auth.tokenHash) {
          await db.delete(sessions).where(eq(sessions.tokenHash, session.tokenHash));
        }
      }
      await logActivity(app, request, auth.user.id, 'Password changed');
      return { ok: true };
    },
  );

  app.post('/api/auth/2fa/setup', async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return reply;
    if (auth.user.totpSecret) return fail(reply, 400, 'Two-factor authentication is already on.');
    const setup = await createTotpSecret(auth.user.email);
    await db
      .update(users)
      .set({ totpPending: seal(config.sessionSecret, setup.secret) })
      .where(eq(users.id, auth.user.id));
    return setup;
  });

  app.post<{ Body: { code: string } }>(
    '/api/auth/2fa/enable',
    {
      schema: {
        body: {
          type: 'object',
          properties: { code: codeSchema },
          required: ['code'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      const pending = auth.user.totpPending;
      if (!pending)
        return fail(
          reply,
          400,
          'Start the set-up first: press "Turn on two-factor authentication".',
        );
      const step = checkTotp(open(config.sessionSecret, pending), request.body.code, null);
      if (step === null) {
        return fail(reply, 400, 'That code is not right. Type the 6 digits your app shows now.');
      }
      await db
        .update(users)
        .set({ totpSecret: pending, totpPending: null, totpLastStep: step })
        .where(eq(users.id, auth.user.id));
      await logActivity(app, request, auth.user.id, 'Two-factor authentication turned on');
      return { ok: true };
    },
  );

  app.post<{ Body: { password: string; code: string } }>(
    '/api/auth/2fa/disable',
    {
      schema: {
        body: {
          type: 'object',
          properties: { password: passwordSchema, code: codeSchema },
          required: ['password', 'code'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      if (!auth.user.totpSecret)
        return fail(reply, 400, 'Two-factor authentication is already off.');
      if (!(await verifyPassword(auth.user.passwordHash, request.body.password))) {
        return fail(reply, 400, 'Your password is not right.');
      }
      if (!(await checkSecondFactor(app, auth.user, request.body.code))) {
        return fail(reply, 400, 'That code is not right.');
      }
      await db
        .update(users)
        .set({ totpSecret: null, totpPending: null, totpLastStep: null })
        .where(eq(users.id, auth.user.id));
      await logActivity(app, request, auth.user.id, 'Two-factor authentication turned off');
      return { ok: true };
    },
  );

  app.post<{ Body: { password: string } }>(
    '/api/auth/recovery-codes',
    {
      schema: {
        body: {
          type: 'object',
          properties: { password: passwordSchema },
          required: ['password'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return reply;
      if (!(await verifyPassword(auth.user.passwordHash, request.body.password))) {
        return fail(reply, 400, 'Your password is not right.');
      }
      const codes = await newRecoveryCodes(db, config, auth.user.id);
      await logActivity(app, request, auth.user.id, 'New recovery codes created');
      return { recoveryCodes: codes };
    },
  );
}
