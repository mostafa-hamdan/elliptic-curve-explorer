/**
 * Rate limits with fixed time windows, counted in the database so that every copy of the
 * server (on a hosting platform there can be many) sees the same counts.
 */
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { rateLimits } from '../db/schema.ts';

/** The outcome of counting one attempt. */
export interface RateLimitResult {
  allowed: boolean;
  /** Attempts counted in the current window, this one included. */
  count: number;
  /** Milliseconds until the window resets. */
  retryAfterMs: number;
}

/**
 * Count one attempt for a key and say whether it is within the limit.
 *
 * One SQL statement does the whole update (start a new window, or add one), so two
 * requests arriving together cannot both slip through as "the first".
 *
 * @param db - the database.
 * @param key - what is counted, for example "signin-ip:203.0.113.5".
 * @param limit - attempts allowed per window.
 * @param windowMs - length of the window in milliseconds.
 * @param now - current time (injectable for tests).
 * @returns whether this attempt is allowed and when the window resets.
 */
export async function hitRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<RateLimitResult> {
  const expired = now - windowMs;
  const rows = await db.all<{ count: number; window_start: number }>(sql`
    INSERT INTO rate_limits (key, count, window_start) VALUES (${key}, 1, ${now})
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN window_start <= ${expired} THEN 1 ELSE count + 1 END,
      window_start = CASE WHEN window_start <= ${expired} THEN ${now} ELSE window_start END
    RETURNING count, window_start
  `);
  const row = rows[0] ?? { count: 1, window_start: now };
  return {
    allowed: row.count <= limit,
    count: row.count,
    retryAfterMs: Math.max(0, row.window_start + windowMs - now),
  };
}

/**
 * Look at a count without adding to it: is the key at or over its limit right now?
 *
 * @param db - the database.
 * @param key - what is counted.
 * @param limit - attempts allowed per window.
 * @param windowMs - length of the window in milliseconds.
 * @param now - current time (injectable for tests).
 * @returns null when under the limit, otherwise the milliseconds until it resets.
 */
export async function rateLimitBlocked(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<number | null> {
  const rows = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  const row = rows[0];
  if (!row || now - row.windowStart >= windowMs || row.count < limit) return null;
  return row.windowStart + windowMs - now;
}

/**
 * Forget the count for a key (after a successful sign-in, for example).
 *
 * @param db - the database.
 * @param key - the key to clear.
 */
export async function clearRateLimit(db: Database, key: string): Promise<void> {
  await db.run(sql`DELETE FROM rate_limits WHERE key = ${key}`);
}

/**
 * Describe a wait in words for an error message.
 *
 * @param ms - milliseconds.
 * @returns for example "about 3 minutes" or "a few seconds".
 */
export function describeWait(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (ms < 60_000) return 'a few seconds';
  return minutes === 1 ? 'about a minute' : `about ${minutes} minutes`;
}
