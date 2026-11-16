/**
 * Opens the database (a local SQLite file through libSQL, or a hosted Turso database) and
 * brings its tables up to date by running the SQL migrations in `server/db/migrations`.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema.ts';

/** The typed database handle used by every route. */
export type Database = LibSQLDatabase<typeof schema>;

/** Folder with the SQL migrations. Built from this file's location, so spaces are fine. */
const MIGRATIONS = fileURLToPath(new URL('./migrations', import.meta.url));

/** Default local database file: `data/oncurve.db` in the project folder. */
export const DEFAULT_DATABASE_FILE = fileURLToPath(
  new URL('../../data/oncurve.db', import.meta.url),
);

/**
 * Turn the DATABASE_URL setting into a libSQL address. Unset means the local file.
 *
 * @param setting - the DATABASE_URL value, if any.
 * @returns an address libSQL understands ("file:…", "libsql://…" or ":memory:").
 */
export function databaseAddress(setting: string | undefined): string {
  if (!setting) {
    mkdirSync(dirname(DEFAULT_DATABASE_FILE), { recursive: true });
    // pathToFileURL encodes spaces as %20, which libSQL decodes correctly.
    return pathToFileURL(DEFAULT_DATABASE_FILE).href;
  }
  return setting;
}

/**
 * Open the database and run any migrations it has not had yet.
 *
 * @param url - libSQL address, for example from {@link databaseAddress}.
 * @param authToken - access token for a hosted database; not needed for a local file.
 * @returns the typed database and the raw client (to close it).
 * @throws when the database cannot be opened or a migration fails.
 */
export async function openDatabase(
  url: string,
  authToken?: string,
): Promise<{ db: Database; client: Client }> {
  const client = createClient({ url, authToken });
  // SQLite only enforces foreign keys (and so ON DELETE CASCADE) when asked to.
  await client.execute('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, client };
}
