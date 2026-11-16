/**
 * Sign-in sessions and CSRF protection.
 *
 * A session is a random 256-bit token in an HttpOnly, SameSite=Strict cookie; the
 * database stores only its keyed hash. A session ends after two hours without activity,
 * or seven days after sign-in, whichever comes first.
 *
 * Every request that changes something must carry the CSRF token in an X-CSRF-Token
 * header, equal to the value of a second HttpOnly cookie (the "double-submit" pattern).
 * A page on another site cannot read that value, so it cannot forge such a request.
 */
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServerConfig } from '../config.ts';
import type { Database } from '../db/client.ts';
import { activity, sessions, users } from '../db/schema.ts';
import { keyedHash, randomToken, safeEqual } from '../security/crypto.ts';

/** Cookie holding the session token. */
export const SESSION_COOKIE = 'oncurve_session';
/** Cookie holding the CSRF token. */
export const CSRF_COOKIE = 'oncurve_csrf';
/** Header the browser copies the CSRF token into. */
export const CSRF_HEADER = 'x-csrf-token';

/** A session ends after this long without a request. */
export const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
/** A session ends this long after sign-in, however active. */
export const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
/** "Last seen" is written at most this often, to save database writes. */
const TOUCH_INTERVAL_MS = 60 * 1000;

/** The signed-in user as the routes see it. */
export type User = typeof users.$inferSelect;

/** What a request knows about who is signed in. */
export interface Auth {
  user: User;
  tokenHash: string;
  publicId: string;
}

/**
 * Cookie settings. Secure (HTTPS only) is added when hosted, so signing in also works on
 * plain http://localhost during a local demo.
 *
 * @param config - server settings.
 * @param maxAgeSeconds - how long the browser keeps the cookie.
 */
export function cookieOptions(config: ServerConfig, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.hosted,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * Describe a browser in a few words from its User-Agent header, for the sessions list:
 * for example "Edge on Windows". Nothing more detailed is kept.
 *
 * @param userAgent - the header, if any.
 * @returns a short description.
 */
export function describeDevice(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'A browser';
  const system = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'an unknown system';
  return `${browser} on ${system}`;
}

/**
 * Start a session for a user and set the cookie. A new CSRF token is issued at the same
 * time, so a token seen before sign-in cannot be reused after it.
 *
 * @param db - the database.
 * @param config - server settings.
 * @param request - the sign-in request (for the device description).
 * @param reply - the reply that will carry the cookies.
 * @param userId - who signed in.
 * @returns the new CSRF token, for the browser to use from now on.
 */
export async function startSession(
  db: Database,
  config: ServerConfig,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: number,
): Promise<string> {
  const token = randomToken(32);
  const now = Date.now();
  const device = describeDevice(request.headers['user-agent']);
  await db.insert(sessions).values({
    tokenHash: keyedHash(config.sessionSecret, token),
    publicId: randomToken(12),
    userId,
    createdAt: now,
    lastSeenAt: now,
    device,
  });
  await db.insert(activity).values({ userId, event: 'Signed in', device, at: now });
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(config, ABSOLUTE_TIMEOUT_MS / 1000));
  return issueCsrfToken(config, reply);
}

/**
 * Set a fresh CSRF token cookie.
 *
 * @param config - server settings.
 * @param reply - the reply that will carry the cookie.
 * @returns the token, which the browser must send back in the X-CSRF-Token header.
 */
export function issueCsrfToken(config: ServerConfig, reply: FastifyReply): string {
  const token = randomToken(32);
  reply.setCookie(CSRF_COOKIE, token, cookieOptions(config, ABSOLUTE_TIMEOUT_MS / 1000));
  return token;
}

/**
 * Find who is signed in from the session cookie. Ends sessions that have timed out and
 * records activity at most once a minute.
 *
 * @param db - the database.
 * @param config - server settings.
 * @param request - the incoming request.
 * @returns the user and session, or null when nobody valid is signed in.
 */
export async function loadAuth(
  db: Database,
  config: ServerConfig,
  request: FastifyRequest,
): Promise<Auth | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = keyedHash(config.sessionSecret, token);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  const idle = now - row.session.lastSeenAt > IDLE_TIMEOUT_MS;
  const tooOld = now - row.session.createdAt > ABSOLUTE_TIMEOUT_MS;
  if (idle || tooOld) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }
  if (now - row.session.lastSeenAt > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.tokenHash, tokenHash));
  }
  return { user: row.user, tokenHash, publicId: row.session.publicId };
}

/**
 * End the current session and clear the cookie.
 *
 * @param db - the database.
 * @param config - server settings.
 * @param auth - the current session.
 * @param reply - the reply that clears the cookie.
 */
export async function endSession(
  db: Database,
  config: ServerConfig,
  auth: Auth,
  reply: FastifyReply,
): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.tokenHash, auth.tokenHash), eq(sessions.userId, auth.user.id)));
  reply.clearCookie(SESSION_COOKIE, cookieOptions(config, 0));
}

/**
 * Check the CSRF token of a request that changes something.
 *
 * @param request - the incoming request.
 * @returns true when the header matches the cookie.
 */
export function csrfIsValid(request: FastifyRequest): boolean {
  const cookie = request.cookies[CSRF_COOKIE];
  const header = request.headers[CSRF_HEADER];
  return (
    typeof cookie === 'string' &&
    typeof header === 'string' &&
    cookie !== '' &&
    safeEqual(cookie, header)
  );
}
