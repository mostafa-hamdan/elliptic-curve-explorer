/**
 * The Learn page: elliptic curve cryptography explained simply, with the geometric
 * picture over the real numbers next to the same calculation mod p, then scalar
 * multiplication and why it keeps keys safe. Every number on this page is computed by
 * the engine, never typed in by hand.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { createCurve, multiply, type AffinePoint } from '@shared/ecc/index.ts';
import { Card } from '../components/ui/Card.tsx';
import { ModLinePlot } from '../features/learn/ModLinePlot.tsx';
import { LEARN_TOPICS } from '../features/learn/topics.tsx';
import { RealCurvePlot } from '../features/learn/RealCurvePlot.tsx';
import { pointText } from '../lib/format.ts';
import { EXPLORER_PATH } from '../lib/paths.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';

/** The small key-exchange example: E17(2, 2) with base point G = (5, 1). */
const E17 = createCurve(17n, 2n, 2n);
const G: AffinePoint = { x: 5n, y: 1n };
const ALICE_SECRET = 3n;
const BOB_SECRET = 7n;
const ALICE_PUBLIC = multiply(E17, ALICE_SECRET, G);
const BOB_PUBLIC = multiply(E17, BOB_SECRET, G);
const SHARED_BY_ALICE = multiply(E17, ALICE_SECRET, BOB_PUBLIC);
const SHARED_BY_BOB = multiply(E17, BOB_SECRET, ALICE_PUBLIC);

interface SectionProps {
  id: string;
  number: string;
  title: string;
  intro: ReactNode;
  children?: ReactNode;
}

/** One numbered section of the page. */
function Section({ id, number, title, intro, children }: SectionProps) {
  return (
    <Card as="section" aria-labelledby={id} className="p-5 sm:p-6">
      <p className="font-mono text-xs font-semibold text-primary">{number}</p>
      <h2 id={id} className="mt-1 text-xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <div className="mt-2 max-w-3xl space-y-2 text-ink-soft">{intro}</div>
      {children && <div className="mt-5">{children}</div>}
    </Card>
  );
}

/** A formula on its own line. */
function Formula({ children }: { children: ReactNode }) {
  return (
    <p className="my-2 inline-block rounded-lg bg-sunken px-3 py-1.5 font-mono text-sm text-ink">
      {children}
    </p>
  );
}

/** The Learn page. */
export function LearnPage() {
  usePageTitle('Learn');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Learn</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Elliptic curves in five short steps. Each picture is live: move the sliders and choose
          points to see the rules at work.
        </p>
        <nav aria-label="Short reads" className="mt-3 flex flex-wrap gap-2">
          <span className="text-sm text-muted">Short reads:</span>
          {LEARN_TOPICS.map((topic) => (
            <Link
              key={topic.slug}
              to={`/learn/${topic.slug}`}
              className="rounded-full border border-line bg-surface px-3 py-0.5 text-sm font-medium text-primary hover:border-primary/50"
            >
              {topic.title}
            </Link>
          ))}
        </nav>
      </div>

      <Section
        id="learn-curve"
        number="01"
        title="What is an elliptic curve?"
        intro={
          <>
            <p>An elliptic curve is the set of points (x, y) that satisfy</p>
            <Formula>y² = x³ + ax + b</Formula>
            <p>
              plus one extra point O, the point at infinity. Over the real numbers it is a smooth
              curve, symmetric about the x-axis. In cryptography the same equation is used mod a
              prime p, so x and y are whole numbers from 0 to p − 1 and the curve becomes a
              scattered set of dots, as on the Explorer page.
            </p>
            <p>
              The curve must not be singular: 4a³ + 27b² must not be 0, otherwise it has a sharp
              point or crosses itself and the rules below break.
            </p>
          </>
        }
      />

      <Section
        id="learn-add"
        number="02"
        title="Adding points: draw a line, then reflect"
        intro={
          <>
            <p>
              To add P and Q, draw the line through them. It meets the curve in exactly one more
              point, −R. Reflect −R in the x-axis and you get R = P + Q. To double a point, use the
              tangent line at P instead. On the left this is done with real numbers; on the right
              the very same formulas run mod 23.
            </p>
            <Formula>λ = (y₂ − y₁)/(x₂ − x₁) · x₃ = λ² − x₁ − x₂ · y₃ = λ(x₁ − x₃) − y₁</Formula>
          </>
        }
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="min-w-0">
            <h3 className="mb-3 text-base font-semibold text-ink">Over the real numbers</h3>
            <RealCurvePlot />
          </div>
          <div className="min-w-0">
            <h3 className="mb-3 text-base font-semibold text-ink">Mod p, on E23(1, 1)</h3>
            <ModLinePlot />
          </div>
        </div>
      </Section>

      <Section
        id="learn-infinity"
        number="03"
        title="The point at infinity and inverses"
        intro={
          <>
            <p>
              If P and Q are mirror images, (x, y) and (x, −y), the line through them is vertical
              and never meets the curve again. We say it meets the curve at infinity, and call that
              point O. So P + (−P) = O, and O works like zero: P + O = P.
            </p>
            <p>
              Mod p, the mirror image of (x, y) is (x, p − y). Doubling a point whose y is 0 also
              gives O, because its tangent is vertical. With O included, the points form a group:
              addition always gives a point of the curve, and every point has an inverse.
            </p>
          </>
        }
      />

      <Section
        id="learn-multiply"
        number="04"
        title="Multiplying a point: double-and-add"
        intro={
          <>
            <p>
              kP means P + P + … + P with k copies. Adding them one by one is far too slow for a
              256-bit k, so the binary digits of k are used instead. Read k from the left: start
              with R = P, then for each further bit double R, and add P when the bit is 1.
            </p>
            <Formula>13 = 1101₂: P → 3P (double, add) → 6P (double) → 13P (double, add)</Formula>
            <p>
              That is 3 doublings and 2 additions instead of 12 additions. For a 256-bit k it is
              about 256 doublings instead of 10⁷⁷ additions.
            </p>
          </>
        }
      />

      <Section
        id="learn-why"
        number="05"
        title="Why this keeps secrets safe"
        intro={
          <>
            <p>
              Computing Q = kP is fast. Going back, finding k from P and Q, is the{' '}
              <strong className="font-semibold text-ink">
                elliptic curve discrete logarithm problem
              </strong>
              , and for a well-chosen 256-bit curve no known method can solve it in a lifetime. Key
              exchange (ECDH) is built on that one-way street:
            </p>
          </>
        }
      >
        <div className="overflow-x-auto rounded-lg border border-line" data-testid="ecdh-example">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Key exchange on E17(2, 2) with G = (5, 1)</caption>
            <thead>
              <tr className="bg-sunken text-left text-xs font-medium tracking-wide text-muted uppercase">
                <th scope="col" className="px-3 py-2">
                  Step
                </th>
                <th scope="col" className="px-3 py-2">
                  Alice
                </th>
                <th scope="col" className="px-3 py-2">
                  Bob
                </th>
              </tr>
            </thead>
            <tbody className="font-mono text-ink">
              <tr className="border-t border-line">
                <td className="px-3 py-2 font-sans text-ink-soft">
                  Agree on the curve E17(2, 2) and G
                </td>
                <td className="px-3 py-2" colSpan={2}>
                  G = {pointText(G)}
                </td>
              </tr>
              <tr className="border-t border-line">
                <td className="px-3 py-2 font-sans text-ink-soft">Pick a secret number</td>
                <td className="px-3 py-2">a = {ALICE_SECRET.toString()}</td>
                <td className="px-3 py-2">b = {BOB_SECRET.toString()}</td>
              </tr>
              <tr className="border-t border-line">
                <td className="px-3 py-2 font-sans text-ink-soft">Send the public point</td>
                <td className="px-3 py-2">A = aG = {pointText(ALICE_PUBLIC)}</td>
                <td className="px-3 py-2">B = bG = {pointText(BOB_PUBLIC)}</td>
              </tr>
              <tr className="border-t border-line bg-point-r-soft">
                <td className="px-3 py-2 font-sans text-ink-soft">Compute the shared secret</td>
                <td className="px-3 py-2">aB = {pointText(SHARED_BY_ALICE)}</td>
                <td className="px-3 py-2">bA = {pointText(SHARED_BY_BOB)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-ink-soft">
          Both get abG, the same point, while someone listening only sees G, A and B. On this tiny
          curve the listener could simply try every k up to 19; on secp256k1 there are about 10⁷⁷ to
          try. Check these numbers yourself in the{' '}
          <Link to={EXPLORER_PATH} className="font-medium text-primary hover:underline">
            Explorer
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
