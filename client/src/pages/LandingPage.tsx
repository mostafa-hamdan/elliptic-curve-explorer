/**
 * The landing page, the first thing a visitor sees: what OnCurve is, the two ways in
 * (open the Explorer straight away, or sign in), what it can do with real screenshots,
 * short "Learn ECC" topics, how it works, security, questions and answers, and who made
 * it. It is a student project, and the page says so: no invented users or numbers.
 */
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Icon, type IconName } from '../components/ui/Icon.tsx';
import { useAuth } from '../features/auth/AuthContext.tsx';
import { CurveHero } from '../features/landing/CurveHero.tsx';
import { LEARN_TOPICS } from '../features/learn/topics.tsx';
import { LIST_POINTS_MAX_P, MAX_FIELD_BITS } from '@shared/ecc/index.ts';
import { cx } from '../lib/cx.ts';
import { grouped } from '../lib/format.ts';
import { EXPLORER_PATH, ISSUES_URL, REPO_URL } from '../lib/paths.ts';

/** The team, shown in the About section. */
export const TEAM: readonly string[] = ['Name 1', 'Name 2', 'Name 3', 'Name 4'];

/** Sections listed in the in-page menu, in order. */
const SECTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'features', label: 'Features' },
  { id: 'learn', label: 'Learn ECC' },
  { id: 'how', label: 'How it works' },
  { id: 'security', label: 'Security' },
  { id: 'faq', label: 'FAQ' },
  { id: 'about', label: 'About' },
];

/* ---------- Building blocks ---------- */

/** A full-width band with a centered column inside. */
function Band({
  id,
  tone = 'plain',
  children,
  labelledBy,
}: {
  id?: string;
  tone?: 'plain' | 'raised';
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cx(
        'scroll-mt-20 border-line',
        tone === 'raised' ? 'border-y bg-surface' : 'bg-bg',
      )}
    >
      <div className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20">{children}</div>
    </section>
  );
}

/** The small label, title and intro at the top of a section. */
function SectionHead({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-note font-semibold tracking-[0.12em] text-accent uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {children && <p className="mt-3 text-lg text-ink-soft">{children}</p>}
    </div>
  );
}

/**
 * A screenshot of the app, in the light or dark version to match the current theme.
 *
 * @param name - file name stem in /screens, for example "points".
 * @param alt - what the picture shows.
 */
function Screenshot({ name, alt, className }: { name: string; alt: string; className?: string }) {
  const frame = cx(
    'block h-auto w-full rounded-xl border border-line bg-surface shadow-pop',
    className,
  );
  return (
    <>
      <img
        src={`/screens/${name}-light.jpg`}
        alt={alt}
        width={1280}
        height={800}
        loading="lazy"
        decoding="async"
        className={cx(frame, 'dark:hidden')}
      />
      <img
        src={`/screens/${name}-dark.jpg`}
        alt={alt}
        width={1280}
        height={800}
        loading="lazy"
        decoding="async"
        className={cx(frame, 'hidden dark:block')}
      />
    </>
  );
}

/** A main feature: text on one side, a screenshot on the other. */
function FeatureRow({
  title,
  icon,
  shot,
  alt,
  flip,
  points,
  children,
}: {
  title: string;
  icon: IconName;
  shot: string;
  alt: string;
  flip?: boolean;
  points: string[];
  children: ReactNode;
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <div className={cx('min-w-0', flip && 'lg:order-2')}>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon name={icon} size={20} />
        </span>
        <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink">
          {title}
        </h3>
        <p className="mt-2 text-ink-soft">{children}</p>
        <ul className="mt-4 space-y-2">
          {points.map((point) => (
            <li key={point} className="flex gap-2 text-sm text-ink-soft">
              <Icon name="check" size={16} className="mt-0.5 shrink-0 text-primary" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={cx('min-w-0', flip && 'lg:order-1')}>
        <Screenshot name={shot} alt={alt} />
      </div>
    </div>
  );
}

/** A smaller feature card with a picture on top. */
function FeatureCard({
  title,
  shot,
  alt,
  to,
  linkLabel,
  children,
}: {
  title: string;
  shot: string;
  alt: string;
  to: string;
  linkLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 shadow-card">
      <Screenshot name={shot} alt={alt} className="shadow-none" />
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-ink-soft">{children}</p>
      <Link
        to={to}
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        {linkLabel} <Icon name="chevronRight" size={14} />
      </Link>
    </div>
  );
}

/** One question and its answer, opened on click. */
function Question({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-line bg-surface open:shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-ink [&::-webkit-details-marker]:hidden">
        {q}
        <Icon
          name="chevronDown"
          size={18}
          className="shrink-0 text-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="px-5 pb-5 text-ink-soft">{children}</div>
    </details>
  );
}

/* ---------- The page ---------- */

/** The landing page. */
export function LandingPage() {
  const { user, status } = useAuth();
  const location = useLocation();

  useEffect(() => {
    document.title = 'OnCurve · Elliptic Curve Explorer';
  }, []);

  // Links such as "/#learn" jump to their section once the page has drawn.
  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }, [location.hash]);

  const accountLink =
    status === 'ready' && user
      ? { to: '/account', label: 'Go to your account' }
      : { to: '/signin', label: 'Sign in / Create account' };

  return (
    <div data-testid="landing">
      {/* ---------- Hero ---------- */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden bg-bg">
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:pt-20 lg:pb-24">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-note font-medium text-ink-soft">
              <span className="h-2 w-2 rounded-full bg-accent-bright" aria-hidden="true" />A student
              project for EECE 632 at AUB
            </p>
            <h1
              id="hero-title"
              className="mt-5 text-5xl leading-[1.05] font-semibold tracking-tight text-ink sm:text-6xl"
            >
              OnCurve
            </h1>
            <p className="mt-4 max-w-xl font-display text-2xl leading-snug text-ink-soft sm:text-[1.75rem]">
              Elliptic curves, worked out step by step, the way you solve them by hand.
            </p>
            <p className="mt-4 max-w-xl text-ink-soft">
              Find every point of Ep(a, b), add two points and multiply a point by a scalar, from
              the classroom curve E23(1, 1) up to the 256-bit curves behind HTTPS and Bitcoin.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={EXPLORER_PATH}
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-5 font-medium text-primary-ink shadow-card transition-colors hover:bg-primary-hover"
              >
                Open the explorer
                <Icon name="chevronRight" size={18} />
              </Link>
              {status !== 'unavailable' && (
                <Link
                  to={accountLink.to}
                  className="inline-flex h-12 items-center gap-2 rounded-lg border border-line-strong bg-surface px-5 font-medium text-ink transition-colors hover:bg-sunken"
                >
                  <Icon name="user" size={18} />
                  {accountLink.label}
                </Link>
              )}
            </div>
            <p className="mt-4 text-note text-muted">
              No account needed to use it. An account only adds saving and history.
            </p>
          </div>
          <div className="min-w-0 rounded-2xl border border-line bg-surface p-3 shadow-pop sm:p-5">
            <CurveHero />
          </div>
        </div>

        {/* In-page menu */}
        <nav aria-label="On this page" className="border-t border-line bg-surface/70">
          <ul className="mx-auto flex w-full max-w-[1200px] flex-wrap gap-x-6 gap-y-1 px-4 py-3 text-sm sm:px-6">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="font-medium text-ink-soft hover:text-primary">
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      {/* ---------- Features ---------- */}
      <Band id="features" tone="raised" labelledBy="features-title">
        <SectionHead
          id="features-title"
          eyebrow="What you can do"
          title="The three operations, fully worked"
        >
          Everything Project 13 asks for, with the hand-method working shown for every result.
        </SectionHead>
        <div className="mt-14 space-y-20">
          <FeatureRow
            title="Find all points"
            icon="grid"
            shot="points"
            alt="The Explorer listing the 28 points of E23(1, 1), with the Hasse check and a plot of the points"
            points={[
              'A square root per x (Euler’s criterion, then Tonelli–Shanks), not a scan of every pair',
              'Paged table, total count with the point at infinity, and the Hasse bound check',
              'Zoomable plot: hover for coordinates, click a dot to use it as P or Q',
            ]}
          >
            Enter p, a and b, or pick a textbook curve. OnCurve checks that p is prime and the curve
            is not singular, then lists every point in a background worker.
          </FeatureRow>
          <FeatureRow
            flip
            title="Add two points"
            icon="plus"
            shot="add"
            alt="Adding (3, 10) and (9, 7) on E23(1, 1), with the slope, the modular inverse and x₃, y₃ worked out"
            points={[
              'Chord and tangent rules, including P + O, P + (−P) and doubling a point with y = 0',
              'The modular inverse worked out with the extended Euclidean algorithm',
              'Points not on the curve are refused, with both sides of the equation shown',
            ]}
          >
            Slope, inverse, x₃ and y₃, line by line, exactly as you would write them on paper, next
            to a plot of the line through P and Q.
          </FeatureRow>
          <FeatureRow
            title="Multiply a point"
            icon="target"
            shot="multiply"
            alt="Scalar multiplication on secp256k1 with the double-and-add table"
            points={[
              'Bit, operation and running result for every bit of k',
              'Exact whole-number arithmetic (BigInt) for 256-bit keys and beyond',
              'An animation that walks P, 2P, 3P … until it comes back to O',
            ]}
          >
            kP with the double-and-add table, from small classroom examples to secp256k1 and P-256.
          </FeatureRow>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          <FeatureCard
            title="Practice by hand"
            shot="practice"
            alt="A practice exercise where the user types each step and the app checks it"
            to="/practice"
            linkLabel="Start practicing"
          >
            Solve an inverse, an addition or a doubling yourself. The app checks each step and
            points to the first wrong one.
          </FeatureCard>
          <FeatureCard
            title="Learn with pictures"
            shot="learn"
            alt="The Learn page with the real-number curve and the chord-and-reflect picture"
            to="/learn"
            linkLabel="Open the Learn page"
          >
            The geometry over the real numbers next to the same sum mod p, with live pictures you
            can move.
          </FeatureCard>
          <FeatureCard
            title="Save your work"
            shot="account"
            alt="The account page with saved curves and the history of calculations"
            to="/signup"
            linkLabel="Create a free account"
          >
            With an account: saved curves and points, a history you can reload with one click, and
            two-factor sign-in.
          </FeatureCard>
        </div>
      </Band>

      {/* ---------- Learn ECC ---------- */}
      <Band id="learn" labelledBy="learn-title">
        <SectionHead id="learn-title" eyebrow="Learn ECC" title="Four short reads">
          The ideas behind elliptic curve cryptography, each with a worked example you can open in
          the Explorer.
        </SectionHead>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LEARN_TOPICS.map((topic, index) => (
            <li key={topic.slug} className="min-w-0">
              <Link
                to={`/learn/${topic.slug}`}
                className="group flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-primary/50"
              >
                <span className="font-mono text-note font-semibold text-accent">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="mt-2 font-display text-xl font-semibold text-ink group-hover:text-primary">
                  {topic.title}
                </span>
                <span className="mt-2 flex-1 text-sm text-ink-soft">{topic.summary}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Read <Icon name="chevronRight" size={14} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Band>

      {/* ---------- How it works ---------- */}
      <Band id="how" tone="raised" labelledBy="how-title">
        <SectionHead id="how-title" eyebrow="How it works" title="From a curve to a worked answer">
          Three steps, all in your browser.
        </SectionHead>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Choose a curve',
              text: 'Type p, a and b, or pick a preset. The curve is checked as you type: p must be prime and 4a³ + 27b² must not be 0 mod p.',
            },
            {
              title: 'Pick an operation',
              text: 'List the points, add P and Q, or multiply P by k. Choose points from the list, from the plot, or type them in.',
            },
            {
              title: 'Read the working',
              text: 'Every result comes with its steps. Export them as CSV, print a report, or ask the assistant to explain a step.',
            },
          ].map((step, index) => (
            <li key={step.title} className="relative rounded-xl border border-line bg-bg p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-mono text-sm font-semibold text-primary-ink">
                {index + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 max-w-3xl text-sm text-ink-soft">
          Under the hood there is one small engine, written for this project, that does all the math
          with exact whole numbers. The same engine runs in the browser and on the server, and its
          results are checked in tests against an exhaustive search on small curves and against an
          independent, well-known library on secp256k1 and P-256.
        </p>
      </Band>

      {/* ---------- Security ---------- */}
      <Band id="security" labelledBy="security-title">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <SectionHead
            id="security-title"
            eyebrow="Security"
            title="Careful with your account, honest about its limits"
          >
            OnCurve is a teaching tool. Do not use it to create or protect real keys: it is not
            hardened against timing attacks.
          </SectionHead>
          <ul className="grid gap-4 sm:grid-cols-2">
            {(
              [
                [
                  'lock',
                  'Passwords',
                  'Stored only as Argon2id hashes. Weak and common passwords are refused.',
                ],
                [
                  'shield',
                  'Two-factor sign-in',
                  'Authenticator app codes, plus ten one-time recovery codes.',
                ],
                [
                  'user',
                  'Sessions',
                  'HttpOnly, SameSite cookies, CSRF tokens and sign-out of every device.',
                ],
                [
                  'info',
                  'No tracking',
                  'No analytics, no email, and deleting your account removes all of your data.',
                ],
              ] as Array<[IconName, string, string]>
            ).map(([icon, title, text]) => (
              <li key={title} className="rounded-xl border border-line bg-surface p-5">
                <Icon name={icon} size={20} className="text-primary" />
                <p className="mt-3 font-semibold text-ink">{title}</p>
                <p className="mt-1 text-sm text-ink-soft">{text}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 text-sm">
          <Link to="/security" className="font-medium text-primary hover:underline">
            Read how each protection works
          </Link>
        </p>
      </Band>

      {/* ---------- FAQ ---------- */}
      <Band id="faq" tone="raised" labelledBy="faq-title">
        <SectionHead id="faq-title" eyebrow="FAQ" title="Questions and answers" />
        <div className="mt-10 grid gap-3 lg:grid-cols-2">
          <Question q="Do I need an account?">
            No. Every calculation, the Learn pages and practice work without one. An account only
            keeps your saved curves, points and history.
          </Question>
          <Question q="How large can p be?">
            Adding and multiplying work for any prime up to {MAX_FIELD_BITS} bits, including the
            256-bit curves used on the internet. Listing every point is limited to p ≤{' '}
            {grouped(LIST_POINTS_MAX_P)}, so that the list finishes in about two seconds.
          </Question>
          <Question q="Can I use it to make real keys?">
            No. It is built to show the math clearly, not to resist side-channel attacks such as
            timing attacks. Use a well-reviewed cryptography library for anything real.
          </Question>
          <Question q="Does it work offline?">
            Yes, apart from the assistant’s AI mode, which needs the internet. The built-in offline
            helper is always available.
          </Question>
          <Question q="Which curves are supported?">
            Curves y² = x³ + ax + b over a prime field, written Ep(a, b). Curves over binary fields
            and other curve shapes, such as Curve25519, are not covered.
          </Question>
          <Question q="Which browsers does it support?">
            Current versions of Chrome, Edge and Firefox. See the{' '}
            <Link to="/limitations" className="font-medium text-primary hover:underline">
              Limitations
            </Link>{' '}
            page for everything the app does not do.
          </Question>
        </div>
      </Band>

      {/* ---------- About and contact ---------- */}
      <Band id="about" labelledBy="about-title">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHead id="about-title" eyebrow="About" title="Who made OnCurve">
              OnCurve is a student project for EECE 632, Cryptography and Network Security, at the
              American University of Beirut (AUB). It is not a company or a commercial product.
            </SectionHead>
            <ul className="mt-6 grid grid-cols-2 gap-3" data-testid="team">
              {TEAM.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display font-semibold text-primary"
                  >
                    {name.charAt(0)}
                  </span>
                  <span className="min-w-0 font-medium text-ink">{name}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8" id="contact">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Contact</h2>
            <p className="mt-2 text-ink-soft">
              Found a mistake, or have a question about the app? Open an issue in the project’s
              public GitHub repository. There is no contact form and no mailing list.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={ISSUES_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-ink hover:bg-primary-hover"
              >
                <Icon name="message" size={17} />
                Open an issue on GitHub
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-line-strong px-4 font-medium text-ink hover:bg-sunken"
              >
                View the source code
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </div>
        </div>
      </Band>

      {/* ---------- Closing call to action ---------- */}
      <section aria-labelledby="cta-title" className="bg-primary">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-6">
          <div>
            <h2 id="cta-title" className="text-3xl font-semibold tracking-tight text-primary-ink">
              Ready to try E23(1, 1)?
            </h2>
            <p className="mt-1 text-primary-ink">
              It opens with the classroom curve already set up. No sign-up.
            </p>
          </div>
          <Link
            to={EXPLORER_PATH}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-surface px-5 font-medium text-ink shadow-card hover:bg-sunken"
          >
            Open the explorer
            <Icon name="chevronRight" size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
