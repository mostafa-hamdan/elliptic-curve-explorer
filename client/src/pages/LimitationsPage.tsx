/**
 * The Limitations page: an honest list of what the app cannot do or only does up to a
 * limit, each with the reason. A stated limit is better than a surprise.
 */
import type { ReactNode } from 'react';
import {
  LIST_POINTS_MAX_P,
  MAX_FIELD_BITS,
  MAX_INPUT_LENGTH,
  MAX_SCALAR_BITS,
} from '@shared/ecc/index.ts';
import { Callout } from '../components/ui/Callout.tsx';
import { Card } from '../components/ui/Card.tsx';
import { SCATTER_MAX_P } from '../features/points/PointsPlot.tsx';
import { grouped } from '../lib/format.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';

interface Limitation {
  /** Short name of the limit. */
  title: string;
  /** What the limit is. */
  limit: ReactNode;
  /** Why it exists, and what still works. */
  reason: ReactNode;
}

/**
 * The limits, most relevant first. The numbers come from the same constants the engine
 * enforces, so this page can never disagree with what the app actually does.
 */
const LIMITATIONS: Limitation[] = [
  {
    title: 'Listing all points',
    limit: <>Works for primes up to p = {grouped(LIST_POINTS_MAX_P)}.</>,
    reason: (
      <>
        A curve has about p points, so the work and the size of the list grow with p. The limit
        keeps the search to roughly one or two seconds on a laptop. Adding and multiplying have no
        such limit and work for any prime, including 256-bit curves.
      </>
    ),
  },
  {
    title: 'The plot',
    limit: (
      <>Single dots are drawn up to p = {SCATTER_MAX_P}. Larger curves switch to a density view.</>
    ),
    reason: (
      <>
        Beyond that size the dots are closer together than one screen pixel, so the plot shades each
        small cell by the number of points inside it instead. Curves too large to list have no plot
        at all.
      </>
    ),
  },
  {
    title: 'Kinds of curve',
    limit: (
      <>
        Only curves E<sub>p</sub>(a, b) of the form y² = x³ + ax + b over a prime field with p &gt;
        3.
      </>
    ),
    reason: (
      <>
        Curves over binary fields GF(2ᵐ), and the Montgomery and Edwards forms (for example
        Curve25519), use different equations and formulas and are not supported.
      </>
    ),
  },
  {
    title: 'Size of the numbers',
    limit: (
      <>
        p and k may have up to {MAX_FIELD_BITS} bits (about 309 digits). An input box accepts at
        most {MAX_INPUT_LENGTH} characters.
      </>
    ),
    reason: (
      <>
        Real curves in use today have 256 to 521 bits, so this leaves plenty of room while keeping
        every calculation instant. k is {MAX_SCALAR_BITS} bits at most for the same reason.
      </>
    ),
  },
  {
    title: 'Checking that p is prime',
    limit: <>Proven correct for p below about 3.3 × 10²⁴; a probabilistic test above that.</>,
    reason: (
      <>
        The app uses the Miller-Rabin test with 24 fixed bases. For larger p a composite number
        would have to fool all 24 bases at once. No such number is known and the chance is below one
        in 10¹⁴ per number, but it is not a mathematical proof.
      </>
    ),
  },
  {
    title: 'Number format',
    limit: <>Results are shown in decimal. Hexadecimal (0x…) is accepted as input only.</>,
    reason: (
      <>
        The steps follow the hand method taught in class, which is done in decimal. Very long
        numbers are shortened in tables; the full value is always in the result line and in the
        step-by-step working.
      </>
    ),
  },
  {
    title: 'Educational use only',
    limit: <>Do not use this app to create or protect real keys or secrets.</>,
    reason: (
      <>
        The calculations are written to be read and followed, not to resist attacks. In particular
        they are not constant-time, so the time a multiplication takes depends on the scalar, which
        a real attacker could measure.
      </>
    ),
  },
  {
    title: 'Saving needs an account',
    limit: <>As a guest, reloading the page starts again from the example curve.</>,
    reason: (
      <>
        Calculations run in your browser. Only the theme, text size and practice record are
        remembered on this device. Signing in adds saved curves and points and a history.
      </>
    ),
  },
  {
    title: 'No email',
    limit: <>The app never sends email, so a lost password is reset with a recovery code.</>,
    reason: (
      <>
        Each account gets ten one-time recovery codes when it is created. Someone who loses both
        their password and all their codes cannot get back in; nobody can reset it for them.
      </>
    ),
  },
  {
    title: 'AI mode of the assistant',
    limit: (
      <>
        Needs internet and a server key, with 20 questions per user per hour and a daily cap for all
        users.
      </>
    ),
    reason: (
      <>
        The cap is 50 questions by default and restarts at midnight UTC; after that, and whenever
        the provider cannot answer, the offline helper takes over. The numbers come from the engine,
        but the wording of an AI answer can be imperfect.
      </>
    ),
  },
  {
    title: 'Browsers',
    limit: <>Tested on current versions of Chrome and Edge. Firefox is not verified yet.</>,
    reason: (
      <>
        Every screen is checked automatically in Chrome and Edge. The same checks do not all pass in
        Firefox yet, so please use Chrome or Edge. The app needs a modern browser with very large
        whole numbers (BigInt) and background workers; Internet Explorer will not run it.
      </>
    ),
  },
];

/** The Limitations page. */
export function LimitationsPage() {
  usePageTitle('Limitations');
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Limitations</h1>
      <p className="mt-1 max-w-3xl text-muted">
        What OnCurve cannot do, or only does up to a limit, and why. Everything not listed here is
        expected to work; if it does not, that is a bug.
      </p>

      <Callout tone="info" title="What has no limit" className="mt-5">
        Adding two points and multiplying a point by a scalar work for every valid curve, from the
        smallest classroom example to the 256-bit curves used on the internet, and always show their
        steps.
      </Callout>

      <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="limitations-list">
        {LIMITATIONS.map((item) => (
          <li key={item.title} className="min-w-0">
            <Card className="h-full p-5">
              <h2 className="text-base font-semibold text-ink">{item.title}</h2>
              <p className="mt-1.5 text-sm font-medium text-ink">{item.limit}</p>
              <p className="mt-1.5 text-sm text-ink-soft">{item.reason}</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
