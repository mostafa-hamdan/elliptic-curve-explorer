# Security

OnCurve is a teaching tool. Its elliptic curve calculations are written to be read, not to
resist attacks (they are not constant-time), so **never use it to create or protect real
keys**. The protections below guard OnCurve accounts and the data in them.

## Reporting a problem

Open an issue on the repository, or contact the team privately if the problem could put
accounts at risk. Please do not include real passwords or keys in a report.

## How accounts are protected

Each protection names the file where it lives, so it can be checked.

| Protection                          | What it does                                                                                                                                                                                                                                                                                                                                                             | Where                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Password hashing                    | Argon2id (19 MiB, 2 passes, 1 lane, OWASP minimum), unique salt per hash. Passwords are never logged or stored.                                                                                                                                                                                                                                                          | `server/security/passwords.ts`                         |
| Password rules                      | At least 12 characters, at most 128, not one of ~49,000 common passwords, a strength rating of at least Fair (zxcvbn 2 of 4), with repeats, keyboard runs and sequences rated down. The same rules run in the page (strength meter) and on the server.                                                                                                                   | `shared/passwordRules.ts`                              |
| Equal treatment of unknown accounts | Wrong email and wrong password get the same message, and an unknown email still runs one Argon2 check so the timing is the same.                                                                                                                                                                                                                                         | `server/routes/auth.ts`                                |
| Sessions                            | 256-bit random token in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` when hosted). Only an HMAC-SHA-256 of the token is stored. Sessions end after 2 hours idle or 7 days. Stored in the database, never in server memory.                                                                                                                                          | `server/auth/sessions.ts`                              |
| Signing out everywhere              | The Security center lists sessions and ends any or all of them. Changing or resetting the password signs out the other sessions.                                                                                                                                                                                                                                         | `server/routes/account.ts`, `server/routes/auth.ts`    |
| CSRF                                | Every state-changing request must carry an `X-CSRF-Token` header equal to an `HttpOnly` cookie (double-submit). A new token is issued at sign-in.                                                                                                                                                                                                                        | `server/app.ts`, `server/auth/sessions.ts`             |
| Two-factor authentication           | TOTP (RFC 6238) with a QR code. The secret is encrypted with AES-256-GCM using a key derived (HKDF) from the server secret. A code cannot be used twice.                                                                                                                                                                                                                 | `server/security/totp.ts`, `server/security/crypto.ts` |
| Recovery codes                      | Ten one-time codes (about 49 bits each) shown once; only their HMAC-SHA-256 is stored. They reset a lost password or replace the authenticator. There is no email.                                                                                                                                                                                                       | `server/security/crypto.ts`, `server/routes/auth.ts`   |
| Sensitive changes                   | Changing the password, turning 2FA off, making new recovery codes and deleting the account need the password and, when 2FA is on, a current authenticator code or a recovery code. Five wrong attempts pause these actions for 15 minutes, so a stolen session cannot be used to guess the code. Every change is written to the Recent activity list.                    | `server/auth/confirm.ts`                               |
| Brute force                         | Per account: five failures lock the account for 15 minutes, for known and unknown emails alike. Per network address: limits on sign-ins (30 per 15 minutes locally, 20 on the hosted site), new accounts (10 per hour locally, 5 hosted) and recovery attempts. Counters live in the database.                                                                           | `server/security/rateLimit.ts`                         |
| Input validation                    | Every route has a JSON schema; unknown fields are refused, not ignored; bodies are capped at 64 KB. Curves and points are checked with the engine before they are stored.                                                                                                                                                                                                | `server/routes/*.ts`, `server/app.ts`                  |
| SQL injection                       | Every query goes through Drizzle ORM with bound parameters; no SQL is built from text.                                                                                                                                                                                                                                                                                   | `server/routes/*.ts`                                   |
| Cross-site scripting                | React escapes all text. The assistant's answers are rendered by a small markdown reader that builds elements directly and never produces HTML.                                                                                                                                                                                                                           | `client/src/features/assistant/markdown.ts`            |
| Security headers                    | Content-Security-Policy allowing only the site's own files, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and HSTS when hosted.                                                                                                                                                                  | `server/app.ts`                                        |
| Access control                      | Every query that touches user data is filtered by the signed-in user's id; ids from the request are never trusted alone.                                                                                                                                                                                                                                                 | `server/routes/account.ts`, `server/routes/data.ts`    |
| Account deletion                    | Deletes the user and every row that belongs to them (each table is cleared explicitly, and foreign keys cascade as well).                                                                                                                                                                                                                                                | `server/routes/account.ts`                             |
| Secrets                             | Only in environment variables (`.env`, never committed). `npm run setup` creates a random 256-bit `SESSION_SECRET`. The AI key stays on the server; the browser never sees it.                                                                                                                                                                                           | `scripts/ensure-env.mjs`, `server/config.ts`           |
| AI mode limits                      | Signed-in users only, 20 questions per hour, 500 characters per question, and a global daily cap (`AI_DAILY_LIMIT`, 50 by default, UTC days) counted in the database; the model may only call tools backed by the engine, and every point and every value after "=" or "≡" in an answer must match a tool result or the user's own messages, or the answer is not shown. | `server/routes/assistant.ts`, `server/assistant/`      |
| AI provider                         | Questions go only to the provider named by `AI_PROVIDER`: OpenAI (default, `POST /v1/responses`, `store: false`) or Anthropic. A missing key or unknown value turns AI mode off; it never switches provider. Email and password are not sent.                                                                                                                            | `server/assistant/provider.ts`, `server/config.ts`     |
| Shared demo account (hosted)        | Its password is public, so its password, 2FA and recovery codes cannot be changed, other visitors cannot be signed out or seen, it cannot be deleted or reset, and wrong passwords do not lock it (the per-address limit still applies).                                                                                                                                 | `server/demo.ts`                                       |
| Visitor address (hosted)            | Behind Vercel, the per-address limits use the `x-vercel-forwarded-for` header, which Vercel always overwrites, so a visitor cannot pick an address; locally such headers are ignored.                                                                                                                                                                                    | `server/security/clientAddress.ts`                     |
| Privacy                             | No analytics and no tracking. Nothing is sent anywhere for guests.                                                                                                                                                                                                                                                                                                       |                                                        |

## The website's "normal answer" refusals

Browsers print every 4xx answer to `fetch()` as a red console error, even an expected one
such as a wrong password. So requests from the website carry `X-OnCurve-Client: web`, and
for those the server turns a 4xx answer into status 200 with the real status in
`X-OnCurve-Status`. This happens in an `onSend` hook, after the route has finished: the
route has already counted the attempt, locked the account or refused the request exactly
as it does for any other client. Only the status line changes; the body, the lockout and
every rate-limit counter are identical. `tests/server/sensitive.test.ts` checks this for
the account lockout and the per-address sign-in limit. A script that leaves the header out
simply gets the real status codes.

## Hosted settings

The hosted site (Vercel with a Turso database) sets these environment variables:

| Variable           | Hosted value | Why                                                                                    |
| ------------------ | ------------ | -------------------------------------------------------------------------------------- |
| `HOSTED`           | `1`          | Secure cookies, HSTS, the visitor address from Vercel, and the protected demo account. |
| `SIGNUPS_PER_HOUR` | `5`          | New accounts per network address per hour (10 locally).                                |
| `SIGNINS_PER_IP`   | `20`         | Sign-in attempts per network address per 15 minutes (30 locally).                      |
| `AI_DAILY_LIMIT`   | `50`         | AI questions per UTC day for all users together.                                       |

A classroom behind one shared network address can reach the sign-up limit; the limit then
names the wait. Secrets (`SESSION_SECRET`, `DATABASE_AUTH_TOKEN`, `OPENAI_API_KEY`) are set
only in the Vercel project settings, never in the repository.

## Tests

`tests/server/auth.test.ts`, `sensitive.test.ts`, `demo.test.ts`, `data.test.ts` and the
assistant tests cover sign-up, sign-in, sessions and their expiry, CSRF, 2FA, recovery
codes, sensitive changes, the demo account, lockout and rate limits, separation between
accounts, account deletion, hostile input and the security headers. Run them with `npm test`.
