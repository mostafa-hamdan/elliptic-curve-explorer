/**
 * Prepares the local database: creates the tables (by running the migrations) and adds a
 * demo account with some saved curves and history, so the account features can be tried
 * at once. Run by `npm run setup`; running it again changes nothing that already exists.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { databaseAddress, openDatabase } from '../server/db/client.ts';
import { history, savedItems, settings, users } from '../server/db/schema.ts';
import { loadEnvFile, optionalEnv } from '../server/env.ts';
import { loadConfig } from '../server/config.ts';
import { hashPassword } from '../server/security/passwords.ts';
import { newRecoveryCodes } from '../server/routes/shared.ts';

/** The demo account. Its details are printed here and listed in the README. */
export const DEMO_EMAIL = 'demo@oncurve.local';
export const DEMO_PASSWORD = 'Elliptic-Demo-2026';

loadEnvFile();
const config = loadConfig();
const { db, client } = await openDatabase(
  databaseAddress(optionalEnv('DATABASE_URL')),
  optionalEnv('DATABASE_AUTH_TOKEN'),
);
console.info('Database tables are up to date.');

const existing = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
if (existing.length > 0) {
  console.info(`The demo account ${DEMO_EMAIL} already exists; it was left unchanged.`);
} else {
  const now = Date.now();
  const inserted = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, passwordHash: await hashPassword(DEMO_PASSWORD), createdAt: now })
    .returning({ id: users.id });
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

  // The demo's recovery codes are written next to the database (which git ignores), so
  // the "lost password" page can be tried too.
  const codesFile = fileURLToPath(new URL('../data/demo-recovery-codes.txt', import.meta.url));
  writeFileSync(
    codesFile,
    `Recovery codes for ${DEMO_EMAIL} (each works once):\n${codes.join('\n')}\n`,
    'utf8',
  );
  console.info(`Created the demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.info('Its recovery codes are in data/demo-recovery-codes.txt');
}

client.close();
