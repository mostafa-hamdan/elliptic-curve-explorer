/**
 * The short "Learn ECC" topic pages linked from the landing page: what an elliptic curve
 * is, point addition, scalar multiplication, and ECC in real life. Each worked example is
 * computed by the engine when the page loads, never typed in by hand, so the text and the
 * Explorer always agree.
 */
import type { ReactNode } from 'react';
import {
  addWithSteps,
  createCurve,
  findPreset,
  hasseCheck,
  listPoints,
  mod,
  multiply,
  multiplyWithSteps,
  rightHandSide,
  type AffinePoint,
} from '@shared/ecc/index.ts';
import { plain, pointText, signed } from '../../lib/format.ts';
import { curvePieces } from './realCurve.ts';

/** One topic page. */
export interface LearnTopic {
  /** Last part of the address, as in /learn/point-addition. */
  slug: string;
  title: string;
  /** One or two sentences for the topic card and the page intro. */
  summary: string;
  /** Example curve the "Try it" button loads into the Explorer. */
  preset: string;
  /** Which Explorer tab the "Try it" button opens. */
  tab: 'points' | 'add' | 'multiply';
  /** The scalar k to fill in, when the example uses a different one from the preset. */
  scalar?: string;
  /** The page body. */
  body: () => ReactNode;
}

/* ---------- Worked examples, computed once by the engine ---------- */

const E23 = createCurve(23n, 1n, 1n);
const E23_POINTS = listPoints(E23);
const E23_COUNT = BigInt(E23_POINTS.length + 1);
const E23_HASSE = hasseCheck(E23.p, E23_COUNT);
const P23: AffinePoint = { x: 3n, y: 10n };
const Q23: AffinePoint = { x: 9n, y: 7n };
const ADD_TRACE = addWithSteps(E23, P23, Q23);
const DOUBLE_TRACE = addWithSteps(E23, P23, P23);

const E17 = createCurve(17n, 2n, 2n);
const G17: AffinePoint = { x: 5n, y: 1n };
const K_EXAMPLE = 13n;
const MULTIPLY_TRACE = multiplyWithSteps(E17, K_EXAMPLE, G17);
const ORDER_17 = 19n;
const ORDER_CHECK = multiply(E17, ORDER_17, G17);

const ALICE = 3n;
const BOB = 7n;
const ALICE_PUBLIC = multiply(E17, ALICE, G17);
const BOB_PUBLIC = multiply(E17, BOB, G17);
const SHARED_A = multiply(E17, ALICE, BOB_PUBLIC);
const SHARED_B = multiply(E17, BOB, ALICE_PUBLIC);

const SECP = findPreset('secp256k1');
const P256 = findPreset('p256');

/* ---------- Small building blocks ---------- */

/** A formula or a line of working on its own row, in the number font. */
export function Formula({ children }: { children: ReactNode }) {
  return (
    <p className="my-3 overflow-x-auto rounded-lg bg-sunken px-3.5 py-2 font-mono text-sm text-ink">
      {children}
    </p>
  );
}

/** A heading inside a topic page. */
function Sub({ children }: { children: ReactNode }) {
  return <h2 className="mt-8 mb-2 text-xl font-semibold text-ink">{children}</h2>;
}

/** Lines of working, one per row, with a short label in front of each. */
function Working({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="my-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 px-3.5 py-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <dt className="text-muted">{label}</dt>
          <dd className="m-0 font-mono wrap-anywhere text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The real curve y² = x³ − x + 1 next to the dots of E23(1, 1). */
function TwoPictures() {
  // Upper and lower halves are separate strokes, so the open branch is not closed off by
  // a vertical line at the right edge.
  const real = curvePieces(-1, 1, -2, 3, 300)
    .flatMap((piece) => [piece.slice(0, piece.length / 2), piece.slice(piece.length / 2)])
    .map((piece) =>
      piece
        .map(([x, y], index) => {
          const px = 10 + ((x + 2) / 5) * 180;
          const py = 100 - (y / 4) * 90;
          return `${index ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
        })
        .join(''),
    )
    .join('');
  return (
    <div className="my-4 grid gap-4 sm:grid-cols-2">
      <figure className="m-0 rounded-xl border border-line bg-surface p-3">
        <svg
          viewBox="0 0 200 200"
          className="h-auto w-full"
          role="img"
          aria-label="The smooth real curve y² = x³ − x + 1"
        >
          <line x1="10" x2="190" y1="100" y2="100" className="stroke-line-strong" />
          <line x1="82" x2="82" y1="10" y2="190" className="stroke-line-strong" />
          <path d={real} fill="none" className="stroke-primary" strokeWidth="2.5" />
        </svg>
        <figcaption className="mt-2 text-note text-muted">
          Over the real numbers: y² = x³ − x + 1, a smooth curve.
        </figcaption>
      </figure>
      <figure className="m-0 rounded-xl border border-line bg-surface p-3">
        <svg
          viewBox="0 0 200 200"
          className="h-auto w-full"
          role="img"
          aria-label={`The ${E23_POINTS.length} points of E23(1, 1) as dots`}
        >
          <rect x="10" y="10" width="180" height="180" className="fill-sunken" rx="6" />
          {E23_POINTS.map((point) => (
            <circle
              key={`${point.x},${point.y}`}
              cx={14 + (Number(point.x) / 22) * 172}
              cy={186 - (Number(point.y) / 22) * 172}
              r="3.6"
              className="fill-primary"
            />
          ))}
        </svg>
        <figcaption className="mt-2 text-note text-muted">
          Mod 23: y² ≡ x³ + x + 1, a scatter of {E23_POINTS.length} dots (plus O).
        </figcaption>
      </figure>
    </div>
  );
}

/* ---------- The topics ---------- */

export const LEARN_TOPICS: readonly LearnTopic[] = [
  {
    slug: 'elliptic-curves',
    title: 'What is an elliptic curve?',
    summary:
      'The equation y² = x³ + ax + b, first as a smooth curve and then as the dots you get when the same equation is worked mod a prime.',
    preset: 'e23-1-1',
    tab: 'points',
    body: () => (
      <>
        <p>An elliptic curve is the set of points (x, y) that satisfy</p>
        <Formula>y² = x³ + ax + b</Formula>
        <p>
          together with one extra point, O, called the point at infinity. O plays the part of zero
          when points are added, which is the subject of the next topic.
        </p>

        <Sub>Two views of the same equation</Sub>
        <p>
          With real numbers the curve is a smooth line, symmetric about the x-axis. Cryptography
          uses whole numbers mod a prime p instead: x and y run from 0 to p − 1 and both sides are
          compared mod p. The curve then becomes a scatter of dots, written Ep(a, b).
        </p>
        <TwoPictures />

        <Sub>Is a point on the curve?</Sub>
        <p>Work out both sides mod p and compare. For (3, 10) on E23(1, 1):</p>
        <Working
          rows={[
            ['Left side', `y² = 10² = 100 ≡ ${plain(mod(P23.y * P23.y, E23.p))} (mod 23)`],
            [
              'Right side',
              `x³ + x + 1 = 27 + 3 + 1 = 31 ≡ ${plain(rightHandSide(E23, P23.x))} (mod 23)`,
            ],
            ['Verdict', 'Both sides agree, so (3, 10) is on the curve.'],
          ]}
        />

        <Sub>The rule that a, b must follow</Sub>
        <p>The curve must not be singular, which means</p>
        <Formula>4a³ + 27b² ≢ 0 (mod p)</Formula>
        <p>
          A singular curve has a sharp point or crosses itself, and the addition rule breaks there.
          The Explorer checks this as you type.
        </p>

        <Sub>How many points?</Sub>
        <p>
          E23(1, 1) has {plain(E23_COUNT)} points including O. Hasse&apos;s theorem says the count N
          is always close to p + 1:
        </p>
        <Formula>|N − (p + 1)| ≤ 2√p</Formula>
        <p>
          For p = 23 that allows {plain(E23_HASSE.lower)} to {plain(E23_HASSE.upper)} points, and{' '}
          {plain(E23_COUNT)} is inside. The Explorer shows this check every time it lists the points
          of a curve.
        </p>
      </>
    ),
  },
  {
    slug: 'point-addition',
    title: 'Point addition',
    summary:
      'Draw a line through two points, find where it meets the curve again, and reflect. The same rule, written as formulas, works mod p.',
    preset: 'e23-1-1',
    tab: 'add',
    body: () => {
      const slope = ADD_TRACE.slope!;
      const dSlope = DOUBLE_TRACE.slope!;
      return (
        <>
          <p>
            To add two points P and Q, draw the line through them. It meets the curve in exactly one
            more point, called −R. Reflect −R in the x-axis to get R = P + Q. To double a point (P +
            P), use the tangent line at P instead.
          </p>
          <Formula>
            λ = (y₂ − y₁) / (x₂ − x₁) for a chord, λ = (3x₁² + a) / (2y₁) for a tangent
          </Formula>
          <Formula>x₃ = λ² − x₁ − x₂, y₃ = λ(x₁ − x₃) − y₁</Formula>
          <p>
            Mod p there is no ordinary division: dividing by d means multiplying by d⁻¹, the number
            with d · d⁻¹ ≡ 1 (mod p), found with the extended Euclidean algorithm.
          </p>

          <Sub>Worked example: (3, 10) + (9, 7) on E23(1, 1)</Sub>
          <Working
            rows={[
              [
                'Slope λ',
                `(${plain(Q23.y)} − ${plain(P23.y)}) / (${plain(Q23.x)} − ${plain(P23.x)}) = ${signed(slope.numeratorRaw)} / ${signed(slope.denominatorRaw)} ≡ ${plain(slope.numerator)} · ${plain(slope.denominator)}⁻¹`,
              ],
              [
                'Inverse',
                `${plain(slope.denominator)}⁻¹ ≡ ${plain(slope.inverse.inverse ?? 0n)} (mod 23), since ${plain(slope.denominator)} · ${plain(slope.inverse.inverse ?? 0n)} = ${plain(slope.denominator * (slope.inverse.inverse ?? 0n))} ≡ 1`,
              ],
              [
                'λ',
                `${plain(slope.numerator)} · ${plain(slope.inverse.inverse ?? 0n)} = ${plain(slope.product)} ≡ ${plain(slope.lambda)}`,
              ],
              [
                'x₃',
                `${plain(slope.lambda)}² − ${plain(P23.x)} − ${plain(Q23.x)} = ${signed(ADD_TRACE.x3Raw!)} ≡ ${plain(ADD_TRACE.result!.x)}`,
              ],
              [
                'y₃',
                `${plain(slope.lambda)} · (${plain(P23.x)} − ${plain(ADD_TRACE.result!.x)}) − ${plain(P23.y)} = ${signed(ADD_TRACE.y3Raw!)} ≡ ${plain(ADD_TRACE.result!.y)}`,
              ],
              ['Answer', `P + Q = ${pointText(ADD_TRACE.result)}`],
            ]}
          />

          <Sub>Doubling: 2 · (3, 10)</Sub>
          <Working
            rows={[
              [
                'Slope λ',
                `(3 · ${plain(P23.x)}² + 1) / (2 · ${plain(P23.y)}) = ${plain(dSlope.numeratorRaw)} / ${plain(dSlope.denominatorRaw)} ≡ ${plain(dSlope.numerator)} · ${plain(dSlope.denominator)}⁻¹ ≡ ${plain(dSlope.lambda)}`,
              ],
              [
                'x₃',
                `${plain(dSlope.lambda)}² − 2 · ${plain(P23.x)} = ${signed(DOUBLE_TRACE.x3Raw!)} ≡ ${plain(DOUBLE_TRACE.result!.x)}`,
              ],
              [
                'y₃',
                `${plain(dSlope.lambda)} · (${plain(P23.x)} − ${plain(DOUBLE_TRACE.result!.x)}) − ${plain(P23.y)} = ${signed(DOUBLE_TRACE.y3Raw!)} ≡ ${plain(DOUBLE_TRACE.result!.y)}`,
              ],
              ['Answer', `2P = ${pointText(DOUBLE_TRACE.result)}`],
            ]}
          />

          <Sub>The special cases</Sub>
          <ul className="list-disc space-y-1 pl-5">
            <li>P + O = P: the point at infinity behaves like zero.</li>
            <li>
              P + (−P) = O, where −(x, y) = (x, p − y): the line is vertical and meets the curve
              only at infinity.
            </li>
            <li>Doubling a point with y = 0 gives O, because its tangent is vertical.</li>
          </ul>
        </>
      );
    },
  },
  {
    slug: 'scalar-multiplication',
    title: 'Scalar multiplication',
    summary:
      'kP means adding P to itself k times. Double-and-add does it in about log₂ k steps, which is what makes 256-bit keys practical.',
    preset: 'e17-2-2',
    tab: 'multiply',
    scalar: K_EXAMPLE.toString(),
    body: () => (
      <>
        <p>
          kP is P + P + … + P with k copies. Adding one copy at a time would take k − 1 additions:
          fine for k = 5, impossible for a 256-bit k, which has about 77 digits.
        </p>

        <Sub>Double-and-add</Sub>
        <p>
          Write k in binary and read it from the left. Start with R = P for the first 1. For each
          later bit, double R, and when the bit is 1 also add P.
        </p>
        <p>
          Example on E17(2, 2) with P = {pointText(G17)} and k = {plain(K_EXAMPLE)} ={' '}
          {MULTIPLY_TRACE.bits}₂:
        </p>
        <div className="my-3 overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Double-and-add for 13P on E17(2, 2)</caption>
            <thead>
              <tr className="bg-sunken text-left text-xs font-medium tracking-wide text-muted uppercase">
                <th scope="col" className="px-3 py-2">
                  Bit
                </th>
                <th scope="col" className="px-3 py-2">
                  Operation
                </th>
                <th scope="col" className="px-3 py-2">
                  Running result
                </th>
              </tr>
            </thead>
            <tbody className="font-mono text-ink">
              {MULTIPLY_TRACE.rows.map((row) => (
                <tr key={row.index} className="border-t border-line">
                  <td className="px-3 py-2">{row.bit}</td>
                  <td className="px-3 py-2 font-sans text-ink-soft">
                    {row.operation === 'start'
                      ? 'Start: R = P'
                      : row.operation === 'double'
                        ? 'Double: R = 2R'
                        : 'Double, then add P'}
                  </td>
                  <td className="px-3 py-2">
                    {plain(row.multiple)}P = {pointText(row.result)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          That is {MULTIPLY_TRACE.doublings} doublings and {MULTIPLY_TRACE.additions} additions
          instead of {plain(K_EXAMPLE - 1n)} additions. A 256-bit k needs about 256 doublings and at
          most 256 additions.
        </p>

        <Sub>The order of a point</Sub>
        <p>
          Keep adding P and you eventually come back to O. The number of steps is the order of P.
          Here {plain(ORDER_17)}P = {pointText(ORDER_CHECK)}, so P has order {plain(ORDER_17)}, and
          every multiple of P repeats after that: (k + {plain(ORDER_17)})P = kP. The multiples
          animation on the Multiply tab walks this cycle dot by dot.
        </p>

        <Sub>Why it keeps keys safe</Sub>
        <p>
          Going forward, from k to kP, is fast. Going back, from P and kP to k, is the elliptic
          curve discrete logarithm problem. On a well-chosen 256-bit curve the best known methods
          need around 2¹²⁸ steps, far beyond any computer.
        </p>
      </>
    ),
  },
  {
    slug: 'ecc-in-real-life',
    title: 'ECC in real life',
    summary:
      'The same addition and multiplication protect web traffic (TLS with P-256) and Bitcoin (secp256k1). The core idea is key exchange.',
    preset: 'secp256k1',
    tab: 'multiply',
    body: () => (
      <>
        <Sub>Key exchange in four lines</Sub>
        <p>
          Two people agree on a curve and a base point G. Each picks a secret number, publishes
          their secret times G, and multiplies the other person&apos;s point by their own secret.
          Both arrive at the same point. Here it is on E17(2, 2) with G = {pointText(G17)}:
        </p>
        <Working
          rows={[
            ['Secrets', `Alice a = ${plain(ALICE)}, Bob b = ${plain(BOB)}`],
            [
              'Public points',
              `A = aG = ${pointText(ALICE_PUBLIC)}, B = bG = ${pointText(BOB_PUBLIC)}`,
            ],
            ['Alice computes', `aB = ${pointText(SHARED_A)}`],
            ['Bob computes', `bA = ${pointText(SHARED_B)}`],
          ]}
        />
        <p>
          Someone listening sees G, A and B but not a or b. On this toy curve they could try all{' '}
          {plain(ORDER_17)} multiples; on a 256-bit curve there are about 10⁷⁷. This is elliptic
          curve Diffie–Hellman (ECDH).
        </p>

        <Sub>HTTPS and TLS: P-256</Sub>
        <p>
          When a browser opens an https:// page, TLS runs a key exchange like the one above to agree
          on fresh keys for that connection. One of the most widely used curves for this, and for
          signing certificates with ECDSA, is NIST P-256:
        </p>
        <Working
          rows={[
            ['p', '2²⁵⁶ − 2²²⁴ + 2¹⁹² + 2⁹⁶ − 1'],
            ['a', '−3 (the Explorer shows it reduced, as p − 3)'],
            ['b', P256 ? P256.b : ''],
          ]}
        />
        <p>
          Many connections also use Curve25519, a curve of a different shape (Montgomery form) that
          this app does not cover.
        </p>

        <Sub>Bitcoin: secp256k1</Sub>
        <p>
          A Bitcoin private key is a random 256-bit number k, and the public key is the point kG on
          secp256k1. Transactions are signed with ECDSA, and since 2021 also with Schnorr
          signatures, both built on the same point multiplication.
        </p>
        <Working
          rows={[
            ['p', '2²⁵⁶ − 2³² − 977'],
            ['a, b', `${SECP ? SECP.a : ''}, ${SECP ? SECP.b : ''}  (the curve y² = x³ + 7)`],
            ['G', SECP ? `(${SECP.pointP[0]}, ${SECP.pointP[1]})` : ''],
          ]}
        />
        <p>
          Both curves are presets in the Explorer, under “From class to real life”. Adding and
          multiplying work there with full 256-bit numbers, 78 digits long; only listing every point
          is limited to small p.
        </p>
      </>
    ),
  },
];

/**
 * Find a topic by its address.
 *
 * @param slug - the last part of the address.
 * @returns the topic, or undefined when there is none with that slug.
 */
export function findTopic(slug: string | undefined): LearnTopic | undefined {
  return LEARN_TOPICS.find((topic) => topic.slug === slug);
}
