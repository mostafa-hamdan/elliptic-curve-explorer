# Changelog

All changes a user can see are listed here, newest first.

## Unreleased

### Added

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
