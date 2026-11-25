/**
 * The demo account: created with sample work so the account features can be tried at once,
 * and, on the hosted site, protected. Its password is public there, so every visitor shares
 * it; nobody may change its password, its two-factor settings or its recovery codes, sign
 * other visitors out, or delete it.
 */
import { eq } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { ServerConfig } from './config.ts';
import type { Database } from './db/client.ts';
import { history, savedItems, settings, users } from './db/schema.ts';
import { fail, newRecoveryCodes } from './routes/shared.ts';
import { hashPassword } from './security/passwords.ts';

/** The demo account. Its details are listed in the README and printed by the setup. */
export const DEMO_EMAIL = 'demo@oncurve.local';
export const DEMO_PASSWORD = 'Elliptic-Demo-2026';

/** The answer to a change the shared demo account does not allow. */
export const DEMO_LOCKED_MESSAGE =
  'The demo account is shared by every visitor, so this cannot be changed here. Create your own free account to try it.';

/**
 * Is this the protected demo account?
 *
 * @param config - the server settings (protection is on when hosted).
 * @param email - the account's email.
 * @returns true when changes to its security must be refused.
 */
export function isLockedDemo(config: ServerConfig, email: string): boolean {
  return config.demoLocked && email === DEMO_EMAIL;
}

/**
 * Refuse a security change on the protected demo account.
 *
 * @param config - the server settings.
 * @param reply - the reply, for the refusal.
 * @param email - the signed-in account's email.
 * @returns true when the change was refused (the route must stop).
 */
export function refuseDemoChange(
  config: ServerConfig,
  reply: FastifyReply,
  email: string,
): boolean {
  if (!isLockedDemo(config, email)) return false;
  fail(reply, 403, DEMO_LOCKED_MESSAGE);
  return true;
}

/**
 * Create the demo account with some saved curves and a short history, if it does not exist.
 * Safe to run on every start: an existing demo account is left as it is.
 *
 * @param db - the database.
 * @param config - the server settings.
 * @returns the new account's recovery codes, or null when it already existed.
 */
export async function ensureDemoAccount(
  db: Database,
  config: ServerConfig,
): Promise<string[] | null> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing.length > 0) return null;

  const now = Date.now();
  const inserted = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, passwordHash: await hashPassword(DEMO_PASSWORD), createdAt: now })
    .onConflictDoNothing()
    .returning({ id: users.id });
  // Another copy of the server created it at the same moment.
  if (inserted.length === 0) return null;
  const userId = inserted[0]!.id;
  const codes = await newRecoveryCodes(db, config, userId);

  const curve = (name: string, p: string, a: string, b: string) => ({
    userId,
    kind: 'curve',
    name,
    data: JSON.stringify({ p, a, b }),
    createdAt: now,
  });
  await db.insert(savedItems).values([
    curve('Classroom curve E23(1, 1)', '23', '1', '1'),
    curve('Cyclic curve E17(2, 2)', '17', '2', '2'),
    curve(
      'secp256k1 (Bitcoin)',
      '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F',
      '0',
      '7',
    ),
    {
      userId,
      kind: 'point',
      name: 'P = (3, 10) on E23(1, 1)',
      data: JSON.stringify({ p: '23', a: '1', b: '1', x: '3', y: '10' }),
      createdAt: now,
    },
  ]);
  await db.insert(history).values([
    {
      userId,
      operation: 'points',
      input: JSON.stringify({ p: '23', a: '1', b: '1' }),
      result: '28 points',
      createdAt: now - 3 * 60_000,
    },
    {
      userId,
      operation: 'add',
      input: JSON.stringify({
        p: '23',
        a: '1',
        b: '1',
        px: '3',
        py: '10',
        qx: '9',
        qy: '7',
        pInfinity: false,
        qInfinity: false,
      }),
      result: '(17, 20)',
      createdAt: now - 2 * 60_000,
    },
    {
      userId,
      operation: 'multiply',
      input: JSON.stringify({
        p: '17',
        a: '2',
        b: '2',
        px: '5',
        py: '1',
        pInfinity: false,
        k: '19',
      }),
      result: 'O',
      createdAt: now - 60_000,
    },
  ]);
  await db
    .insert(settings)
    .values({ userId, data: JSON.stringify({ tourDone: false }), updatedAt: now });
  return codes;
}
