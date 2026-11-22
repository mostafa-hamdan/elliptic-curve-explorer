/**
 * The global daily cap on AI questions, shared by all users, so the provider bill has a hard
 * ceiling. One counter in the database serves every copy of the server. A day runs from
 * midnight to midnight UTC.
 */
import type { Database } from '../db/client.ts';
import { hitRateLimit, rateLimitBlocked } from '../security/rateLimit.ts';

/** The counter's key in the rate-limit table. */
const DAILY_KEY = 'ai-daily';
/** One day in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** What everyone sees once the cap is reached. */
export const DAILY_LIMIT_NOTICE =
  'Today’s AI questions are used up. AI mode returns at midnight UTC.';

/**
 * The moment the current UTC day began.
 *
 * Formula: now − (now mod 86 400 000). Using this as the counter's clock makes its window a
 * calendar day: the count restarts at midnight rather than 24 hours after the first question.
 *
 * @param now - the time in milliseconds since 1970.
 * @returns the start of that UTC day.
 */
export function startOfUtcDay(now: number): number {
  return now - (now % DAY_MS);
}

/**
 * Has today's cap been reached? Counts nothing.
 *
 * @param db - the database.
 * @param limit - questions allowed per day; 0 turns AI mode off.
 * @param now - current time (injectable for tests).
 * @returns true when no more AI questions are allowed today.
 */
export async function dailyLimitReached(
  db: Database,
  limit: number,
  now = Date.now(),
): Promise<boolean> {
  if (limit === 0) return true;
  return (await rateLimitBlocked(db, DAILY_KEY, limit, DAY_MS, startOfUtcDay(now))) !== null;
}

/**
 * Count one AI question. A single SQL statement does it, so two users asking at the same
 * moment cannot both take the last place.
 *
 * @param db - the database.
 * @param limit - questions allowed per day.
 * @param now - current time (injectable for tests).
 * @returns true when this question is within today's cap.
 */
export async function countDailyQuestion(
  db: Database,
  limit: number,
  now = Date.now(),
): Promise<boolean> {
  return (await hitRateLimit(db, DAILY_KEY, limit, DAY_MS, startOfUtcDay(now))).allowed;
}
