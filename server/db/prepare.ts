/**
 * Turns an open libSQL connection into the typed database the routes use, and brings its
 * tables up to date by running the SQL migrations in `server/db/migrations`. Kept apart
 * from the code that opens the connection, so the hosted function can open a Turso
 * database over HTTPS without loading the local SQLite engine.
 */
import { fileURLToPath } from 'node:url';
import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
// The web build of the driver wraps any libSQL client and loads no native code itself.
import { drizzle } from 'drizzle-orm/libsql/web';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema.ts';

/** The typed database handle used by every route. */
export type Database = LibSQLDatabase<typeof schema>;

/**
 * Folder with the SQL migrations, next to this file. In the hosted bundle the build script
 * copies the folder next to the bundle, so the same relative address works there too.
 */
const MIGRATIONS = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * Prepare a connection: switch on foreign keys and run any migrations not run yet.
 *
 * @param client - an open libSQL client (a local file, memory, or a hosted database).
 * @returns the typed database and the client (to close it).
 * @throws when a migration fails.
 */
export async function prepareDatabase(client: Client): Promise<{ db: Database; client: Client }> {
  // SQLite only enforces foreign keys (and so ON DELETE CASCADE) when asked to.
  await client.execute('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, client };
}
