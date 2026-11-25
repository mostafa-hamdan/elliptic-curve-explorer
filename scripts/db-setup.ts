/**
 * Prepares the local database: creates the tables (by running the migrations) and adds a
 * demo account with some saved curves and history, so the account features can be tried
 * at once. Run by `npm run setup`; running it again changes nothing that already exists.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { databaseAddress, openDatabase } from '../server/db/client.ts';
import { DEMO_EMAIL, DEMO_PASSWORD, ensureDemoAccount } from '../server/demo.ts';
import { loadEnvFile, optionalEnv } from '../server/env.ts';
import { loadConfig } from '../server/config.ts';

loadEnvFile();
const config = loadConfig();
const { db, client } = await openDatabase(
  databaseAddress(optionalEnv('DATABASE_URL')),
  optionalEnv('DATABASE_AUTH_TOKEN'),
);
console.info('Database tables are up to date.');

const codes = await ensureDemoAccount(db, config);
if (codes === null) {
  console.info(`The demo account ${DEMO_EMAIL} already exists; it was left unchanged.`);
} else {
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
