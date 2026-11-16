/**
 * The Help page: how to use each part of the app, answers to common questions, the
 * keyboard shortcuts and what to do when something does not work.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LIST_POINTS_MAX_P } from '@shared/ecc/index.ts';
import { Button } from '../components/ui/Button.tsx';
import { Card } from '../components/ui/Card.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { ShortcutsTable } from '../features/preferences/ShortcutsDialog.tsx';
import { useShell } from '../features/shell/ShellContext.tsx';
import { useTutorial } from '../features/tutorial/TutorialContext.tsx';
import { grouped } from '../lib/format.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';

/** One "how to" card: a numbered task with its steps. */
const HOW_TO: ReadonlyArray<{ title: string; steps: ReactNode[] }> = [
  {
    title: 'Set up a curve',
    steps: [
      'Pick an example from the list, or type p, a and b.',
      'Wait for the green box: it confirms that p is prime and the curve is not singular.',
      'Values outside 0 … p − 1 are allowed; the app reduces them mod p and shows the result.',
    ],
  },
  {
    title: 'Find all points',
    steps: [
      'Open the All points tab and press Find all points.',
      'Read the count N and the Hasse bound check, then browse the table page by page.',
      'Hover over the plot to read a point; click a dot, or a P or Q button in the table, to use that point in the other tabs.',
    ],
  },
  {
    title: 'Add two points',
    steps: [
      'Open the Add points tab and type P and Q, or pick them from the list.',
      'Press Calculate P + Q (or Enter in any box). Press Double P to compute 2P.',
      'Read the steps below the result: the slope, the inverse, then x₃ and y₃.',
    ],
  },
  {
    title: 'Multiply a point',
    steps: [
      'Open the Multiply tab, type P and the scalar k, and press Calculate kP.',
      'The table has one row per bit of k. Press Show on any row to see its working.',
      'Press Animate multiples to watch P, 2P, 3P, … run until they return to O.',
    ],
  },
];

/** Frequently asked questions, each with a short answer. */
const QUESTIONS: ReadonlyArray<{ question: string; answer: ReactNode }> = [
  {
    question: 'Why must p be a prime greater than 3?',
    answer:
      'Dividing is part of every addition (the slope is a fraction). Division mod p always works when p is prime, because every number except 0 then has an inverse. For p = 2 and p = 3 the equation y² = x³ + ax + b does not cover all elliptic curves, so the course formulas do not apply.',
  },
  {
    question: 'What does "singular" mean?',
    answer:
      'When 4a³ + 27b² ≡ 0 (mod p), the cubic x³ + ax + b has a repeated root and the curve has a sharp point or crosses itself. At such a point the tangent is not defined, so the addition rule breaks and the points no longer form a group.',
  },
  {
    question: 'What is the point at infinity O?',
    answer:
      'O is the extra point that makes the addition work in every case. It is the identity: P + O = P. It is also the answer whenever the line through two points is vertical, for example P + (−P) = O, or doubling a point whose y is 0.',
  },
  {
    question: 'Why does the point count include O?',
    answer:
      'The group of points always contains O, so N counts it. Hasse’s theorem says N is close to p + 1: |N − (p + 1)| ≤ 2√p. The app checks this for every curve it lists.',
  },
  {
    question: 'I forgot my password. What now?',
    answer:
      'Use one of the ten recovery codes you saved when you created the account, on the "Forgot your password?" page. The app never sends email, so the codes are the only way back in.',
  },
  {
    question: 'Why can I not list the points of secp256k1?',
    answer: (
      <>
        A curve has about p points. For a 256-bit p that is about 10⁷⁷ points, far more than any
        computer could list. Listing works up to p = {grouped(LIST_POINTS_MAX_P)}; adding and
        multiplying work for every p.
      </>
    ),
  },
  {
    question: 'Can I type numbers in hexadecimal?',
    answer:
      'Yes: start the number with 0x, as in 0xFF. Real curves publish their constants in hexadecimal, so this saves converting them. Spaces, commas and underscores between digits are ignored.',
  },
  {
    question: 'What does "has changed since this result was calculated" mean?',
    answer:
      'Results are calculated when you press the button, not while you type. If you edit P, Q or k afterwards, the old result stays on screen with this note, so you never mistake it for the answer to the new values.',
  },
  {
    question: 'Is my work saved?',
    answer:
      'As a guest, your theme, text size and practice record are remembered in this browser; calculations stay on the page until you reload it. Sign in (it is free) to save curves and points and keep a history of every calculation.',
  },
];

/** Problems someone might meet, with the fix. */
const TROUBLESHOOTING: ReadonlyArray<{ problem: string; fix: string }> = [
  {
    problem: 'The page stays blank.',
    fix: 'Use a current version of Chrome or Edge, and make sure the window that runs the app is still open.',
  },
  {
    problem: 'The address http://localhost:3000 does not open.',
    fix: 'The window where you started the app prints the address it really uses. If port 3000 was busy, it moved to 3001 or the next free one.',
  },
  {
    problem: 'The Copy button says "Copy failed".',
    fix: 'The browser blocked the clipboard. Select the result with the mouse and copy it with Ctrl+C instead.',
  },
  {
    problem: 'Find all points does not appear.',
    fix: 'The curve must be valid (green box) and p must be at most 200,000. For larger p the tab explains why.',
  },
];

/** A section heading with an icon. */
function SectionTitle({
  icon,
  children,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  children: ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
      <Icon name={icon} size={18} className="text-primary" />
      {children}
    </h2>
  );
}

/** The Help page. */
export function HelpPage() {
  usePageTitle('Help');
  const tutorial = useTutorial();
  const { openPanel } = useShell();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Help</h1>
          <p className="mt-1 max-w-3xl text-muted">
            How to use OnCurve, answers to common questions, and what to do if something does not
            work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon="play" onClick={tutorial.start}>
            Take the guided tour
          </Button>
          <Button icon="sparkle" variant="primary" onClick={() => openPanel('assistant')}>
            Ask the assistant
          </Button>
        </div>
      </div>

      <section aria-labelledby="howto-heading" className="mt-6">
        <h2 id="howto-heading" className="sr-only">
          How to
        </h2>
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {HOW_TO.map((item, index) => (
            <li key={item.title} className="min-w-0">
              <Card className="h-full p-5">
                <p className="font-mono text-xs font-semibold text-primary">0{index + 1}</p>
                <h3 className="mt-1 text-base font-semibold text-ink">{item.title}</h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-soft marker:text-muted">
                  {item.steps.map((step, stepIndex) => (
                    <li key={stepIndex}>{step}</li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <Card as="section" aria-labelledby="faq-heading" className="p-5">
          <SectionTitle icon="help">
            <span id="faq-heading">Common questions</span>
          </SectionTitle>
          <div className="mt-3 divide-y divide-line" data-testid="faq">
            {QUESTIONS.map((item) => (
              <details key={item.question} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-2.5 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <Icon
                    name="chevronDown"
                    size={16}
                    className="text-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="pb-3 text-sm text-ink-soft">{item.answer}</p>
              </details>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card as="section" aria-labelledby="keys-heading" className="p-5">
            <SectionTitle icon="keyboard">
              <span id="keys-heading">Keyboard shortcuts</span>
            </SectionTitle>
            <div className="mt-3">
              <ShortcutsTable />
            </div>
          </Card>

          <Card as="section" aria-labelledby="trouble-heading" className="p-5">
            <SectionTitle icon="alert">
              <span id="trouble-heading">If something does not work</span>
            </SectionTitle>
            <dl className="mt-3 space-y-3 text-sm">
              {TROUBLESHOOTING.map((item) => (
                <div key={item.problem}>
                  <dt className="font-medium text-ink">{item.problem}</dt>
                  <dd className="mt-0.5 text-ink-soft">{item.fix}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-ink-soft">
              Some things are limits rather than faults; they are listed on the{' '}
              <Link to="/limitations" className="font-medium text-primary hover:underline">
                Limitations page
              </Link>
              .
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
