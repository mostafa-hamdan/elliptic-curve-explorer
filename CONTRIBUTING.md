# Contributing to OnCurve

These are the team rules. They are short on purpose: follow them and every part of the
project stays consistent, tested and easy for a reader to follow.

## Getting started

1. Install Node.js LTS (version 22 or newer) and Git.
2. In the project folder run `npm install`.
3. Run `npm run dev` for the website with live reload, or `npm start` for the full app.

The project folder may contain spaces in its path. Every script must keep working with
that: build paths in code with `fileURLToPath(new URL(...))` or `path.join`, and quote
paths in shell and batch files.

## Project layout

| Folder        | What lives there                                                      |
| ------------- | --------------------------------------------------------------------- |
| `client/`     | The website (React, Vite, Tailwind CSS).                              |
| `server/`     | The Node.js server (Fastify).                                         |
| `shared/ecc/` | The elliptic curve engine. One copy, used by website, server, tests.  |
| `tests/`      | Unit and property tests (Vitest, fast-check), browser tests in `e2e`. |
| `docs/`       | Notes for the report and the design decisions.                        |

## Code rules

- TypeScript in strict mode everywhere. No `any` unless a comment explains why.
- All curve maths uses `bigint`. Never use `number` for a field element, a coordinate or
  a scalar: 256-bit values do not fit.
- The engine in `shared/ecc/` has no dependencies and never touches the screen or the
  network. Screens call the engine; they never redo the maths themselves.
- Colours, fonts, spacing and radii come from the design tokens in
  `client/src/styles/tokens.css`. Do not hard-code a colour in a component.
- Only add a dependency that installs from prebuilt files. Setup must never need a
  compiler on Windows.
- Secrets live in environment variables only. Never commit `.env`; list new variable
  names in `.env.example`.
- Files ending in `.local.md` are private notes and are never committed.

## Comments

The code is read as part of the grade, so comments are part of the work.

- Every file opens with two or three lines saying what it does and where it fits.
- Every function states its purpose, inputs, output and the errors it can raise.
- Every maths function also shows its formula.
- Comments explain why, and the edge cases, in plain English. Do not restate the code.

## Tests

- New behaviour comes with a test. A bug fix comes with a test that fails without the fix.
- `npm run check` (lint, type check, unit tests) must pass before every commit.
- `npm run test:e2e` runs the browser tests. They fail on any console error or warning.
- Never weaken or delete a failing test to get a green run. Fix the cause.

## Commits and pull requests

- Small commits that each leave the app working.
- Message format: `type: short description in the present tense`, for example
  `feat: show slope steps for point doubling`. Types: `feat`, `fix`, `test`, `docs`,
  `refactor`, `style`, `chore`.
- A message describes the change and nothing else: no tool names, no co-author lines, no
  "generated with" lines, no links to chat sessions.
- Update `CHANGELOG.md` when a change is visible to a user.

## Honesty about limits

If something does not work, or only works up to a limit, say so on the Limitations page
and in the README. A stated limit is fine; a hidden one is not.
