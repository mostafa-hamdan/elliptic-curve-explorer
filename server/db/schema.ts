/**
 * The database tables, described with Drizzle ORM. Every table that holds a user's data
 * has a `userId` column, and every query filters on it, so one account can never read
 * another account's rows. Deleting a user deletes all of their rows (ON DELETE CASCADE).
 * Times are stored as milliseconds since 1970 (UTC).
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Accounts. The email is only a sign-in name: the app never sends email. */
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Lower-cased email address used to sign in. */
    email: text('email').notNull(),
    /** Argon2id hash of the password; it contains its own random salt. */
    passwordHash: text('password_hash').notNull(),
    /** Authenticator (TOTP) secret, encrypted; null when 2FA is off. */
    totpSecret: text('totp_secret'),
    /** A secret being set up but not confirmed yet, encrypted. */
    totpPending: text('totp_pending'),
    /** Last accepted TOTP time step, so a code cannot be used twice. */
    totpLastStep: integer('totp_last_step'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

/** One-time recovery codes for a lost password or authenticator, stored hashed. */
export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** HMAC-SHA-256 of the code; the code itself is shown once and never stored. */
    codeHash: text('code_hash').notNull(),
    usedAt: integer('used_at'),
  },
  (table) => [index('recovery_codes_user').on(table.userId)],
);

/** Signed-in browsers. The cookie holds a random token; only its hash is stored here. */
export const sessions = sqliteTable(
  'sessions',
  {
    /** HMAC-SHA-256 of the cookie token. */
    tokenHash: text('token_hash').primaryKey(),
    /** A separate random id that can be shown and used to end the session remotely. */
    publicId: text('public_id').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    /** A short description of the browser, for the list of active sessions. */
    device: text('device').notNull(),
  },
  (table) => [
    index('sessions_user').on(table.userId),
    uniqueIndex('sessions_public_id').on(table.publicId),
  ],
);

/** Curves and points a user has saved by name. */
export const savedItems = sqliteTable(
  'saved_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'curve' (p, a, b) or 'point' (p, a, b, x, y). */
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    /** The values as JSON text; numbers are kept as decimal strings. */
    data: text('data').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('saved_items_user').on(table.userId)],
);

/** Every calculation a signed-in user made, newest first when listed. */
export const history = sqliteTable(
  'history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'points', 'add' or 'multiply'. */
    operation: text('operation').notNull(),
    /** The inputs as JSON text, enough to load them back into the Explorer. */
    input: text('input').notNull(),
    /** The result as display text, for example "(17, 20)" or "28 points". */
    result: text('result').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('history_user').on(table.userId, table.createdAt)],
);

/** Preferences and progress: theme, text size, tour seen, practice record. */
export const settings = sqliteTable('settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** JSON text. */
  data: text('data').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Security events shown in the Security center: sign-ins, password and 2FA changes. */
export const activity = sqliteTable(
  'activity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    device: text('device').notNull(),
    at: integer('at').notNull(),
  },
  (table) => [index('activity_user').on(table.userId, table.at)],
);

/**
 * Counters for rate limits, kept in the database (not in memory) so they still work when
 * a hosted server runs as many short-lived copies.
 */
export const rateLimits = sqliteTable('rate_limits', {
  /** What is being counted, for example "signin-ip:203.0.113.5". */
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  /** Start of the current counting window. */
  windowStart: integer('window_start').notNull(),
});
