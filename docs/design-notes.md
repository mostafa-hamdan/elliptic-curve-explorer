# Design notes

Decisions made where the specification left a choice open, with the reason for each.
These are meant as raw material for the project report.

## Engine

- **The point at infinity is `null`.** O has no coordinates, so it is modeled as "no
  point" instead of a special pair of numbers. Every operation handles it explicitly.
- **Two versions of each operation.** `add` and `multiply` return only the answer and are
  used inside loops; `addWithSteps` and `multiplyWithSteps` also return every
  intermediate number. The screens never redo the math: they only display these traces.
- **Double-and-add reads the bits from the left.** That matches the table taught in
  class: start with R = P, then for each further bit double, and add P when the bit is 1.
- **Negative scalars are accepted**, using (−k)P = k(−P). The table then works with |k|
  and −P and says so.
- **Coordinates outside 0 … p − 1 are reduced**, and the screen shows the reduced point,
  in the same way a and b are reduced.
- **Listing limit: p ≤ 200,000.** Measured: about 1.1 s for p ≈ 200,000 on the
  development laptop, against a 2 s target. The search takes one square root mod p per x
  (Euler's criterion, then Tonelli-Shanks), so the work grows with p, not p².
- **Size limits: p and k up to 1024 bits; inputs up to 400 characters.** Real curves use
  256 to 521 bits. The limits keep every calculation instant and stop absurd input early.
- **Primality: Miller-Rabin with the first 24 primes as bases.** Proven correct below
  about 3.3 × 10²⁴; probabilistic above. This is stated on the Limitations page.
- **Hexadecimal input** (0x…) is accepted everywhere, because the published constants of
  real curves are written in hex. Output is decimal, like the hand method.

## Website

- **The app opens on E23(1, 1)** with sample points already filled in, so a first-time
  visitor sees a working example before typing anything.
- **Results are computed on a button press, not on every keystroke.** A result is a
  record of one operation with its inputs. If the inputs change afterwards, the result
  stays and is marked as out of date; if the curve changes, results are removed because
  they belong to the old curve.
- **Input boxes grow and wrap.** A 256-bit number has 78 digits; a one-line box would
  hide most of it.
- **Plot modes.** Up to p = 400 every point is a dot; above that the dots would be
  closer than one pixel, so the plot shades cells by the number of points in them.
- **The list of points is sent from the background worker as typed arrays**, which move
  between threads without copying and keep 200,000 points cheap to hold.
- **One file of design tokens** (`client/src/styles/tokens.css`) holds every color,
  font and radius. Tailwind's built-in palette is switched off, so a component cannot
  use a color that is not a token. P is always teal (the brand color), Q coral (the one
  accent) and results plum, in both themes.
- **Three bundled fonts with separate jobs.** Fraunces (a soft serif, with its optical-size
  axis) for page and section titles gives the app its own voice; Instrument Sans keeps body
  text compact and clean; JetBrains Mono keeps numbers in columns. All are self-hosted, so
  the Content-Security-Policy still allows fonts from the site only.
- **The curve is the brand.** The logo, the favicon and the landing picture all draw
  y² = x³ − x + 1 with a chord through three of its points, the picture behind every
  addition. The landing animation stops for people who ask for reduced motion and has a
  pause button for everyone.
- **A landing page in front of the Explorer, never a sign-in wall.** The Explorer moved to
  `/explorer`; the landing page offers it first. Guests can press Save: the save is parked
  in the tab's session storage (30 minutes at most, addresses inside the site only) and
  finished when the guest is back on the same screen after signing in or up.
- **Landing screenshots come from the real app** (`scripts/capture-screens.ts`), in light
  and dark versions that follow the chosen theme.

## Accounts and security

- **Email as the sign-in name, but no email is ever sent.** The specification asks for one
  message for "wrong email or wrong password", so accounts are identified by an email
  address; lost passwords are reset with recovery codes.
- **Lockout by rate-limit counters, for known and unknown emails alike.** Five failures
  lock an email for 15 minutes whether or not an account exists, so a lockout reveals
  nothing. Counters live in the database so they hold across hosted instances.
- **Sessions: idle 2 hours, at most 7 days.** Long enough for a lab session, short enough
  for a shared computer.
- **Double-submit CSRF token** (an HttpOnly cookie plus a header), renewed at sign-in.
- **Expected refusals reach the website as status 200.** Browsers print every 4xx answer
  to fetch() as a red console error, even a wrong password. The website marks its requests
  (`X-OnCurve-Client: web`); for those, 4xx answers come back as 200 with the real status
  in `X-OnCurve-Status`. Other clients and the API tests see the real status codes.
- **Dialogs render in a portal and stop form events**, so a form in a dialog never submits
  a form around the button that opened it.
- **Per-network limits are settings** (`SIGNUPS_PER_HOUR`, `SIGNINS_PER_IP`); the browser
  tests raise them because all their accounts come from 127.0.0.1.
- **No inlined assets.** Vite's `assetsInlineLimit` is 0, so the Content-Security-Policy can
  allow fonts and images from the site itself only.

## Assistant

- **Offline helper first.** It always works, needs no key, and explains results from the
  engine's own step data. AI mode is used only when the server has a key and the user is
  signed in; any failure falls back to the offline helper with a short notice.
- **AI mode has two providers, chosen by `AI_PROVIDER`.** OpenAI is the default
  (`gpt-6-luna`, the Responses API); Anthropic stays available
  (Claude Haiku 5.5, effort `low`). Both use a manual tool loop with the same six
  engine-backed tools and strict schemas, at most six rounds, 20 questions per user per
  hour, 500 characters per question.
- **The reasoning effort is a setting** (`OPENAI_REASONING_EFFORT`, `low` by default),
  passed on as written so a future value needs no code change. If the model refuses it,
  the request is sent again without it, the setting is dropped for the rest of the run, and
  the server window says so once.
- **"Every number from a tool" is enforced in code** (`server/assistant/numberCheck.ts`).
  Checked: every point (x, y) and every number right after "=" or "≡". Allowed sources:
  tool results, the question, the current work and earlier turns. Numbers in prose, in
  names (secp256k1, E23(1, 1)) and in algebra (2P, 3x₁², 2^256) are not checked, so
  conceptual answers pass. A failure gets one reminder; a second failure goes to the
  offline helper with a notice. The tool results include every intermediate value of the
  hand method (λ products, λ², x₁ − x₃, the inverse check), so a fully worked answer can
  quote all of them.
- **The provider never changes by itself.** A missing key or a mistyped `AI_PROVIDER` turns
  AI mode off, so questions cannot reach a company nobody chose.
- **Responses API with `store: false`.** Each request carries the whole exchange, including
  the reasoning items, so a hosted server keeps no state and OpenAI is asked to store none.
- **A global daily cap puts a ceiling on the bill.** One database counter per UTC day. A
  question is counted before the call, because a call that fails half way may still cost
  money. A full day does not use up anyone's hourly allowance.
- **Provider limits fall back quietly.** A rate limit, empty budget or disallowed model is
  nothing a student can act on, so the offline helper answers with no warning, and the panel
  header stops claiming AI mode.
- **Answers are rendered without HTML** by a small markdown reader (paragraphs, lists,
  bold, code).

## Website additions

- **Text size scales everything**: all sizes are in rem, and the setting changes the root
  font size (87.5 % to 125 % of the browser's own size).
- **The guided tour skips any part that is not on screen** after waiting up to a second,
  so it never points at nothing.
- **Practice accepts any congruent answer** (−3 for 20 mod 23) and suggests the reduced form.
- **The password rules (with a 49,000-word list) load only on password forms**, keeping the
  main page small.

## Tooling

- **TypeScript 6.0 rather than 7.0.** The lint plugin (typescript-eslint) does not
  support TypeScript 7 yet.
- **One package, no workspaces.** One `npm install` at the top level installs
  everything, which is the simplest thing for someone running the project once.
- **The server runs TypeScript directly** (through `tsx`), so there is no separate build
  step for it.
- **Browser tests** run in Chromium by default; the installed Microsoft Edge can be
  added locally with `PW_EDGE=1`. Both pass in full.
- **Firefox works; its CI job does not block.** The app was checked by hand in Firefox.
  On CI (Linux machines without a graphics card) headless Firefox sometimes ends a test
  with "Page crashed", always on the Explorer page, while choosing an example curve or
  running the accessibility check. Nothing in the app's own output points to a bug, and
  Playwright's Firefox build does not start on the development laptop, so it cannot be
  reproduced there. It is treated as a problem of the test machine: the Firefox job draws
  in software, records the last console lines when a page crashes, and does not block a
  change.
