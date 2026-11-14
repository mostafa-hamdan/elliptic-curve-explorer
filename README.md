# OnCurve: Elliptic Curve Explorer

OnCurve is a learning app for elliptic curves over a prime field, written Ep(a, b):

    y² ≡ x³ + ax + b (mod p)

Given p, a and b it finds every point on the curve, adds two points and multiplies a
point by a scalar. Every result shows the same steps you would write when solving it by
hand.

The project is under active development. Full run instructions, screenshots and the
feature list will be added here as the features land.

## Run it

You need Node.js LTS (version 22 or newer).

    npm install
    npm start

Then open http://localhost:3000 in a browser.

## Development

    npm run dev        # website with live reload on http://localhost:5173
    npm run check      # lint, type check and unit tests
    npm run test:e2e   # browser tests

See [CONTRIBUTING.md](CONTRIBUTING.md) for the team rules.
