# Changelog

All changes a user can see are listed here, newest first.

## Unreleased

### Added

- Accounts (optional): sign-up with a password strength meter, sign-in, two-factor
  authentication with an authenticator app, ten recovery codes for a lost password, a
  Security center (password, 2FA, recovery codes, sessions, activity, delete account),
  saved curves and points, and a history of calculations with one-click reload.
- Assistant: offline helper (built-in answers, inverse and prime checks, "explain my last
  result" from the engine's steps) and an optional AI mode backed by the same engine.
- Practice mode that checks hand-worked steps and points to the first mistake.
- Learn page with the real-number picture next to the same addition mod p.
- Interactive plot (hover, click to choose P or Q, zoom, drag) and a multiples animation.
- Export: CSV of points, steps and tables; the plot as PNG; a printable report.
- Guided tour, Help and Security pages, display settings (theme, text size), keyboard
  shortcuts, Reset to example.
- `npm run setup`, `npm start` (opens the browser, finds a free port), and start files for
  Windows and macOS.

### Fixed

- Counts of one in summaries now read "1 addition", not "1 additions".
- Dialogs no longer submit a form around them; long working lines break between words.

- Curve setup for Ep(a, b) with live validation: prime check, reduction of a and b mod p,
  and rejection of singular curves, each with a clear message.
- Find all points: paged table including the point at infinity, total count, Hasse bound
  check and a plot (single dots for small p, a density view for larger p). The search
  runs in the background with a progress bar, for primes up to 200,000.
- Add two points, with the full hand-method working: which rule applies, the slope, the
  modular inverse by the extended Euclidean algorithm, x₃, y₃ and a final check.
- Multiply a point by a scalar with the double-and-add table. Any row opens to show the
  working of its doubling and addition. Works on 256-bit curves.
- Special cases explained on screen: O as the identity, P + (−P) = O, doubling a point
  with y = 0, k = 0, negative k, and oversized or non-numeric input.
- Example curves: five textbook curves, secp256k1 and NIST P-256, each with sample points.
- Points can be picked from the table or from a menu instead of being typed.
- Light and dark themes, following the system setting until one is chosen.
- Limitations page stating what the app cannot do and why.
- Project skeleton: TypeScript, lint and formatting rules, unit, property and browser
  tests, continuous integration, and a small web server with a health check.
