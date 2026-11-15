# Design notes

Decisions made where the specification left a choice open, with the reason for each.
These are meant as raw material for the project report.

## Engine

- **The point at infinity is `null`.** O has no coordinates, so it is modelled as "no
  point" instead of a special pair of numbers. Every operation handles it explicitly.
- **Two versions of each operation.** `add` and `multiply` return only the answer and are
  used inside loops; `addWithSteps` and `multiplyWithSteps` also return every
  intermediate number. The screens never redo the maths: they only display these traces.
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
- **One file of design tokens** (`client/src/styles/tokens.css`) holds every colour,
  font and radius. Tailwind's built-in palette is switched off, so a component cannot
  use a colour that is not a token. P is always blue, Q amber and results green.

## Tooling

- **TypeScript 6.0 rather than 7.0.** The lint plugin (typescript-eslint) does not
  support TypeScript 7 yet.
- **One package, no workspaces.** One `npm install` at the top level installs
  everything, which is the simplest thing for someone running the project once.
- **The server runs TypeScript directly** (through `tsx`), so there is no separate build
  step for it.
- **Browser tests** run in Chromium by default. Firefox runs on CI; the installed
  Microsoft Edge can be added locally with `PW_EDGE=1`.
