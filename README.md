# OnCurve: Elliptic Curve Explorer

OnCurve is a learning app for elliptic curves over a prime field, written Ep(a, b):

    y² ≡ x³ + ax + b (mod p)

Given p, a and b it finds every point on the curve, adds two points and multiplies a
point by a scalar. Every result shows the same steps you would write when solving it by
hand: the slope, the modular inverse by the extended Euclidean algorithm, x₃ and y₃, and
the double-and-add table.

## Run it

You need [Node.js](https://nodejs.org) LTS (version 22 or newer). Nothing else.

    npm install
    npm start

Then open http://localhost:3000 in a browser. `npm start` builds the website and starts
the server; press Ctrl+C to stop it.

## What it does

- **Curve setup** with live checks: p must be a prime greater than 3, a and b are reduced
  mod p, and singular curves (4a³ + 27b² ≡ 0) are rejected with the reason.
- **Find all points**: a paged table with the point at infinity O, the total count, the
  Hasse bound check and a plot. Runs in the background with a progress bar.
- **Add two points**, including doubling, with every step of the working.
- **Multiply a point by a scalar** with the double-and-add table; each row opens to show
  its own working. Works for textbook curves and for real 256-bit curves.
- **Example curves**: E23(1, 1), E17(2, 2) and other textbook curves, plus secp256k1 and
  NIST P-256.
- Light and dark themes, and clear messages for every kind of wrong input.

What the app cannot do is listed openly on its Limitations page.

## Project layout

| Folder        | What lives there                                           |
| ------------- | ---------------------------------------------------------- |
| `shared/ecc/` | The elliptic curve engine (BigInt, no dependencies).       |
| `client/`     | The website (React, Vite, Tailwind CSS).                   |
| `server/`     | The Node.js server (Fastify) that serves the website.      |
| `tests/`      | Unit and property tests, and browser tests in `tests/e2e`. |
| `docs/`       | Design notes.                                              |

## Development

    npm run dev        # website with live reload on http://localhost:5173
    npm run check      # lint, type check, unit and property tests
    npm run test:e2e   # browser tests (first run: npx playwright install chromium)

The engine is checked against an exhaustive search for every curve over the primes 5, 7,
11, 13, 17, 23 and 97, against the group laws, and against an independent library for
secp256k1 and P-256. See [CONTRIBUTING.md](CONTRIBUTING.md) for the team rules and
[docs/design-notes.md](docs/design-notes.md) for the decisions made along the way.
