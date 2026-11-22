# Security

OnCurve is a teaching tool. Its elliptic curve calculations are written to be read, not to
resist attacks (they are not constant-time), so **never use it to create or protect real
keys**. The protections below guard OnCurve accounts and the data in them.

## Reporting a problem

Open an issue on the repository, or contact the team privately if the problem could put
accounts at risk. Please do not include real passwords or keys in a report.

## How accounts are protected

Each protection names the file where it lives, so it can be checked.

| Protection                          | What it does                                                                                                                                                                                                                                  | Where                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Password hashing                    | Argon2id (19 MiB, 2 passes, 1 lane, OWASP minimum), unique salt per hash. Passwords are never logged or stored.                                                                                                                               | `server/security/passwords.ts`                         |
| Password rules                      | At least 12 characters, at most 128, not one of ~49,000 common passwords, zxcvbn score of at least 3. The same rules run in the page (strength meter) and on the server.                                                                      | `shared/passwordRules.ts`                              |
| Equal treatment of unknown accounts | Wrong email and wrong password get the same message, and an unknown email still runs one Argon2 check so the timing is the same.                                                                                                              | `server/routes/auth.ts`                                |
| Sessions                            | 256-bit random token in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` when hosted). Only an HMAC-SHA-256 of the token is stored. Sessions end after 2 hours idle or 7 days. Stored in the database, never in server memory.               | `server/auth/sessions.ts`                              |
| Signing out everywhere              | The Security center lists sessions and ends any or all of them. Changing or resetting the password signs out the other sessions.                                                                                                              | `server/routes/account.ts`, `server/routes/auth.ts`    |
| CSRF                                | Every state-changing request must carry an `X-CSRF-Token` header equal to an `HttpOnly` cookie (double-submit). A new token is issued at sign-in.                                                                                             | `server/app.ts`, `server/auth/sessions.ts`             |
| Two-factor authentication           | TOTP (RFC 6238) with a QR code. The secret is encrypted with AES-256-GCM using a key derived (HKDF) from the server secret. A code cannot be used twice.                                                                                      | `server/security/totp.ts`, `server/security/crypto.ts` |
| Recovery codes                      | Ten one-time codes (about 49 bits each) shown once; only their HMAC-SHA-256 is stored. They reset a lost password or replace the authenticator. There is no email.                                                                            | `server/security/crypto.ts`, `server/routes/auth.ts`   |
| Brute force                         | Per account: five failures lock the account for 15 minutes, for known and unknown emails alike. Per network address: limits on sign-ins (30 per 15 minutes), new accounts (10 per hour) and recovery attempts. Counters live in the database. | `server/security/rateLimit.ts`                         |
| Input validation                    | Every route has a JSON schema; unknown fields are refused, not ignored; bodies are capped at 64 KB. Curves and points are checked with the engine before they are stored.                                                                     | `server/routes/*.ts`, `server/app.ts`                  |
| SQL injection                       | Every query goes through Drizzle ORM with bound parameters; no SQL is built from text.                                                                                                                                                        | `server/routes/*.ts`                                   |
| Cross-site scripting                | React escapes all text. The assistant's answers are rendered by a small markdown reader that builds elements directly and never produces HTML.                                                                                                | `client/src/features/assistant/markdown.ts`            |
| Security headers                    | Content-Security-Policy allowing only the site's own files, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and HSTS when hosted.                                       | `server/app.ts`                                        |
| Access control                      | Every query that touches user data is filtered by the signed-in user's id; ids from the request are never trusted alone.                                                                                                                      | `server/routes/account.ts`, `server/routes/data.ts`    |
| Account deletion                    | Deletes the user and every row that belongs to them (each table is cleared explicitly, and foreign keys cascade as well).                                                                                                                     | `server/routes/account.ts`                             |
| Secrets                             | Only in environment variables (`.env`, never committed). `npm run setup` creates a random 256-bit `SESSION_SECRET`. The AI key stays on the server; the browser never sees it.                                                                | `scripts/ensure-env.mjs`, `server/config.ts`           |
| AI mode limits                      | Signed-in users only, 20 questions per hour, 500 characters per question, and a global daily cap (`AI_DAILY_LIMIT`, 50 by default, UTC days) counted in the database; the model may only call tools backed by the engine.                     | `server/routes/assistant.ts`, `server/assistant/`      |
| AI provider                         | Questions go only to the provider named by `AI_PROVIDER`: OpenAI (default, `POST /v1/responses`, `store: false`) or Anthropic. A missing key or unknown value turns AI mode off; it never switches provider. Email and password are not sent. | `server/assistant/provider.ts`, `server/config.ts`     |
| Privacy                             | No analytics and no tracking. Nothing is sent anywhere for guests.                                                                                                                                                                            |                                                        |

## Tests

`tests/server/auth.test.ts`, `tests/server/data.test.ts` and `tests/server/assistant.test.ts`
cover sign-up, sign-in, sessions and their expiry, CSRF, 2FA, recovery codes, lockout and
rate limits, separation between accounts, account deletion, hostile input and the security
headers. Run them with `npm test`.
