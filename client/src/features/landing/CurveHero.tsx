/**
 * The brand picture on the landing page: the real curve y² = x³ − x + 1 with the
 * chord-and-tangent rule played out step by step. First P + Q (a chord), then 2P (a
 * tangent), on a loop. People who ask their system for less motion see one still frame,
 * and everyone can pause it. The numbers only draw a picture; they come from the same
 * real-number helper as the Learn page.
 */
import { useEffect, useState } from 'react';
import { Icon } from '../../components/ui/Icon.tsx';
import { cx } from '../../lib/cx.ts';
import { curvePieces, pointNear, realAdd, type RealPoint } from '../learn/realCurve.ts';

/** The curve y² = x³ + ax + b drawn in the picture. */
const A = -1;
const B = 1;

/** The part of the plane shown. At x = 2.4 the curve reaches y ≈ ±3.5, just inside. */
const VIEW = { xMin: -2, xMax: 2.4, yMin: -3.6, yMax: 3.6 };
/** The picture's size in SVG units. */
const WIDTH = 560;
const HEIGHT = 440;
const PAD = 16;

/** Convert a curve coordinate to SVG units. */
function sx(x: number): number {
  return PAD + ((x - VIEW.xMin) / (VIEW.xMax - VIEW.xMin)) * (WIDTH - 2 * PAD);
}
function sy(y: number): number {
  return PAD + ((VIEW.yMax - y) / (VIEW.yMax - VIEW.yMin)) * (HEIGHT - 2 * PAD);
}

/**
 * The curve outline as SVG path data. Each piece runs along the upper half and back along
 * the lower half; the two halves are drawn as separate strokes so that the open branch is
 * not closed by a vertical line at the right edge of the picture.
 */
const CURVE_PATH = curvePieces(A, B, VIEW.xMin, VIEW.xMax, 400)
  .flatMap((piece) => {
    const half = piece.length / 2;
    return [piece.slice(0, half), piece.slice(half)];
  })
  .map((part) =>
    part.map(([x, y], index) => `${index ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`),
  )
  .map((parts) => parts.join(''))
  .join('');

/** One scene of the loop: two points (equal for doubling) and what the rule gives. */
interface Scene {
  label: string;
  p: { x: number; y: number };
  q: { x: number; y: number };
  third: { x: number; y: number };
  sum: { x: number; y: number };
  doubling: boolean;
}

/**
 * Build a scene from the x values of P and Q.
 *
 * @param px - x of P.
 * @param pUpper - true to take P on the upper half of the curve, false for the lower.
 * @param qx - x of Q; the same x and half as P gives a doubling.
 * @param qUpper - which half Q is on.
 * @returns the scene, with the third point −R and the sum R.
 * @throws Error when the chosen points give O, which would be a mistake in this file.
 */
function makeScene(px: number, pUpper: boolean, qx: number, qUpper: boolean): Scene {
  const p = pointNear(A, B, px, pUpper, VIEW.xMin, VIEW.xMax) as { x: number; y: number };
  const q = pointNear(A, B, qx, qUpper, VIEW.xMin, VIEW.xMax) as { x: number; y: number };
  const { sum, third } = realAdd(A, p, q);
  if (sum === null || third === null) throw new Error('The hero scene must not give O.');
  const doubling = px === qx && pUpper === qUpper;
  return { label: doubling ? '2P' : 'P + Q', p, q, third, sum, doubling };
}

/** The two scenes: a chord, then a tangent. Both stay inside the picture. */
const SCENES: readonly Scene[] = [makeScene(-1, false, 0.5, true), makeScene(1.2, true, 1.2, true)];

/** The steps of one scene, shown one after the other. */
const PHASES = 5;
/** Time each step stays on screen, in milliseconds. */
const PHASE_MS = 1100;

/**
 * The line to draw for a scene: through P and Q (or the tangent at P), extended a little
 * past the outermost of P, Q and −R.
 */
function sceneLine(scene: Scene): { x1: number; y1: number; x2: number; y2: number } {
  const xs = [scene.p.x, scene.q.x, scene.third.x];
  const slope = (scene.third.y - scene.p.y) / (scene.third.x - scene.p.x);
  const left = Math.min(...xs) - 0.45;
  const right = Math.max(...xs) + 0.45;
  return {
    x1: sx(left),
    y1: sy(scene.p.y + slope * (left - scene.p.x)),
    x2: sx(right),
    y2: sy(scene.p.y + slope * (right - scene.p.x)),
  };
}

/** Does the visitor's system ask for reduced motion? */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** A labeled dot. */
function Dot({
  point,
  label,
  tone,
  shown,
  below,
}: {
  point: RealPoint;
  label: string;
  tone: 'p' | 'muted' | 'accent';
  shown: boolean;
  below?: boolean;
}) {
  if (point === null) return null;
  const cx0 = sx(point.x);
  const cy0 = sy(point.y);
  // Near the right edge the label goes on the left of the dot, so it is never cut off.
  const leftSide = cx0 > WIDTH - 150;
  return (
    <g className={cx('transition-opacity duration-500', shown ? 'opacity-100' : 'opacity-0')}>
      <circle
        cx={cx0}
        cy={cy0}
        r={tone === 'accent' ? 8 : 6.5}
        className={cx(
          tone === 'p' && 'fill-primary',
          tone === 'muted' && 'fill-surface stroke-ink-soft',
          tone === 'accent' && 'fill-accent-bright stroke-surface',
        )}
        strokeWidth={tone === 'muted' ? 2 : 2.5}
      />
      <text
        x={leftSide ? cx0 - 14 : cx0 + 12}
        y={below ? cy0 + 22 : cy0 - 12}
        textAnchor={leftSide ? 'end' : 'start'}
        className={cx(
          'font-mono text-[17px] font-semibold',
          tone === 'accent' ? 'fill-accent' : tone === 'p' ? 'fill-primary' : 'fill-ink-soft',
        )}
      >
        {label}
      </text>
    </g>
  );
}

/** The animated hero picture, with its pause button. */
export function CurveHero() {
  const [still] = useState(prefersReducedMotion);
  const [paused, setPaused] = useState(false);
  // Count of steps shown so far; the scene and step follow from it.
  const [tick, setTick] = useState(still ? PHASES - 1 : 0);

  useEffect(() => {
    if (still || paused) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), PHASE_MS);
    return () => window.clearInterval(timer);
  }, [still, paused]);

  const scene = SCENES[Math.floor(tick / PHASES) % SCENES.length] as Scene;
  const phase = tick % PHASES;
  const line = sceneLine(scene);

  return (
    <figure className="relative m-0" data-testid="curve-hero">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full"
        role="img"
        aria-label="The elliptic curve y² = x³ − x + 1. A line through two points P and Q meets the curve at a third point; reflecting that point in the x-axis gives P + Q. Doubling uses the tangent line instead."
      >
        {/* Axes */}
        <line
          x1={PAD}
          x2={WIDTH - PAD}
          y1={sy(0)}
          y2={sy(0)}
          className="stroke-line-strong"
          strokeWidth="1"
        />
        <line
          x1={sx(0)}
          x2={sx(0)}
          y1={PAD}
          y2={HEIGHT - PAD}
          className="stroke-line-strong"
          strokeWidth="1"
        />

        {/* The curve */}
        <path
          d={CURVE_PATH}
          fill="none"
          className="stroke-primary"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        {/* Step 1: the chord (or tangent) is drawn from end to end. */}
        <line
          key={`line-${tick - phase}`}
          {...line}
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={phase >= 1 ? 0 : 1}
          className="stroke-ink-soft transition-[stroke-dashoffset] duration-700 ease-out"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Step 3: the reflection from −R to R. */}
        <line
          x1={sx(scene.third.x)}
          y1={sy(scene.third.y)}
          x2={sx(scene.sum.x)}
          y2={sy(scene.sum.y)}
          className={cx(
            'stroke-accent transition-opacity duration-500',
            phase >= 3 ? 'opacity-100' : 'opacity-0',
          )}
          strokeWidth="2"
          strokeDasharray="6 6"
        />

        <Dot point={scene.p} label="P" tone="p" shown below={scene.p.y < 0} />
        {!scene.doubling && <Dot point={scene.q} label="Q" tone="p" shown />}
        <Dot
          point={scene.third}
          label="−R"
          tone="muted"
          shown={phase >= 2}
          below={scene.third.y < 0}
        />
        <Dot
          point={scene.sum}
          label={`R = ${scene.label}`}
          tone="accent"
          shown={phase >= 3}
          below={scene.sum.y < 0}
        />
      </svg>

      {!still && (
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? 'Play the animation' : 'Pause the animation'}
          title={paused ? 'Play the animation' : 'Pause the animation'}
          className="absolute right-2 bottom-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-line bg-surface/90 text-ink-soft hover:text-ink"
          data-testid="hero-pause"
        >
          <Icon name={paused ? 'play' : 'pause'} size={14} />
        </button>
      )}
      <figcaption className="sr-only">
        The chord-and-tangent rule on y² = x³ − x + 1, the picture behind every addition in OnCurve.
      </figcaption>
    </figure>
  );
}
