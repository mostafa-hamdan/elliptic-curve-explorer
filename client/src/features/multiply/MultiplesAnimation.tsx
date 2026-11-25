/**
 * Animation of the multiples of a point: P, 2P, 3P, … one addition at a time, until the
 * sum returns to the point at infinity O. The number of steps that takes is the order of
 * P. On small curves the multiples are drawn on the plot of all points with a trail
 * between them, which shows how P "walks" around the curve.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { add, listPoints, type Curve, type Point } from '@shared/ecc/index.ts';
import { Button } from '../../components/ui/Button.tsx';
import { ChoiceGroup } from '../../components/ui/ChoiceGroup.tsx';
import { cx } from '../../lib/cx.ts';
import { grouped, pointText } from '../../lib/format.ts';
import { SCATTER_MAX_P } from '../points/PointsPlot.tsx';

/** A label to draw next to a dot of the plot, in plot units. */
export interface PlacedLabel {
  /** Which multiple (1 for P). */
  multiple: number;
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

/**
 * Place the "kP" labels so that none covers another label or a dot of the walk.
 *
 * Each label tries eight places around its dot (above right first) and takes the first one
 * that stays inside the plot and overlaps nothing placed so far. The current multiple is
 * placed first, so it always gets the best spot; a label that finds no free place is left
 * out (the list beside the plot still names every multiple).
 *
 * @param dots - the dots of the walk, in order: dots[0] is P. Plot units, y downwards.
 * @param current - index of the current multiple in `dots`.
 * @param size - the plot's width and height.
 * @param dot - the dot radius.
 * @param fontSize - the label height.
 * @returns the labels to draw.
 */
export function placeLabels(
  dots: ReadonlyArray<{ cx: number; cy: number }>,
  current: number,
  size: number,
  dot: number,
  fontSize: number,
): PlacedLabel[] {
  type Box = { left: number; top: number; right: number; bottom: number };
  const overlaps = (a: Box, b: Box) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const dotBoxes: Box[] = dots.map(({ cx, cy }) => ({
    left: cx - dot,
    top: cy - dot,
    right: cx + dot,
    bottom: cy + dot,
  }));
  const taken: Box[] = [];
  const placed: PlacedLabel[] = [];
  const order = [current, ...dots.map((_, index) => index).filter((index) => index !== current)];
  const gap = dot * 1.3;

  for (const index of order) {
    const { cx, cy } = dots[index]!;
    const text = `${index + 1}P`;
    const width = text.length * fontSize * 0.62;
    // Places around the dot: dx and dy move the text's anchor point; "end" puts it left.
    const candidates: Array<{ dx: number; dy: number; anchor: 'start' | 'end' }> = [
      { dx: gap, dy: -gap, anchor: 'start' },
      { dx: gap, dy: gap + fontSize * 0.8, anchor: 'start' },
      { dx: -gap, dy: -gap, anchor: 'end' },
      { dx: -gap, dy: gap + fontSize * 0.8, anchor: 'end' },
      { dx: gap * 1.2, dy: fontSize * 0.35, anchor: 'start' },
      { dx: -gap * 1.2, dy: fontSize * 0.35, anchor: 'end' },
      { dx: width / 2, dy: -gap * 1.6, anchor: 'end' },
      { dx: -width / 2, dy: gap * 1.6 + fontSize * 0.8, anchor: 'start' },
    ];
    for (const { dx, dy, anchor } of candidates) {
      const x = cx + dx;
      const y = cy + dy;
      const box: Box = {
        left: anchor === 'start' ? x : x - width,
        right: anchor === 'start' ? x + width : x,
        top: y - fontSize * 0.8,
        bottom: y + fontSize * 0.2,
      };
      const inside = box.left >= 0 && box.right <= size && box.top >= 0 && box.bottom <= size;
      const free =
        inside &&
        !taken.some((other) => overlaps(box, other)) &&
        !dotBoxes.some((other, other_index) => other_index !== index && overlaps(box, other));
      if (free) {
        taken.push(box);
        placed.push({ multiple: index + 1, x, y, anchor });
        break;
      }
    }
  }
  return placed.sort((a, b) => a.multiple - b.multiple);
}

/** The animation stops after this many multiples if O has not been reached. */
export const MAX_MULTIPLES = 500;

/** Milliseconds between steps for each speed. */
const SPEEDS = { slow: 900, normal: 450, fast: 120 } as const;
type Speed = keyof typeof SPEEDS;

/**
 * Compute P, 2P, 3P, … until the sum is O or the limit is reached.
 *
 * @param curve - a validated curve.
 * @param point - a point on it.
 * @param limit - the most multiples to compute.
 * @returns the multiples in order (the last one is null when O was reached) and whether
 *          O was reached, which means the list length is the order of P.
 */
export function multiplesOf(
  curve: Curve,
  point: Point,
  limit = MAX_MULTIPLES,
): { multiples: Point[]; reachedInfinity: boolean } {
  const multiples: Point[] = [point];
  let running = point;
  while (running !== null && multiples.length < limit) {
    running = add(curve, running, point);
    multiples.push(running);
  }
  return { multiples, reachedInfinity: multiples[multiples.length - 1] === null };
}

interface MultiplesAnimationProps {
  curve: Curve;
  point: Point;
}

/** The animation with its controls. */
export function MultiplesAnimation({ curve, point }: MultiplesAnimationProps) {
  const { multiples, reachedInfinity } = useMemo(() => multiplesOf(curve, point), [curve, point]);
  const p = Number(curve.p);
  const drawable = curve.p <= BigInt(SCATTER_MAX_P);
  // All points of a small curve, drawn faintly behind the trail.
  const background = useMemo(() => (drawable ? listPoints(curve) : []), [curve, drawable]);

  // People who ask their system for less motion start with the animation paused.
  const [playing, setPlaying] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [shown, setShown] = useState(1);
  const [speed, setSpeed] = useState<Speed>('normal');
  const listRef = useRef<HTMLOListElement>(null);
  const finished = shown >= multiples.length;

  // Advance one multiple at a time while playing.
  useEffect(() => {
    if (!playing || finished) return;
    const timer = window.setTimeout(() => setShown((value) => value + 1), SPEEDS[speed]);
    return () => window.clearTimeout(timer);
  }, [playing, finished, shown, speed]);

  // Keep the current multiple in view inside the list (without scrolling the page).
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !item) return;
    const top = item.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 2);
    }
  }, [shown]);

  /** Show one multiple and stop the animation there. */
  function jumpTo(multiple: number) {
    setPlaying(false);
    setShown(Math.min(multiples.length, Math.max(1, multiple)));
  }

  const current = multiples[shown - 1] ?? null;
  const trail = multiples
    .slice(0, shown)
    .filter((value): value is NonNullable<Point> => value !== null);

  /** SVG position of a point: y grows upwards, as on the other plots. */
  const at = (value: NonNullable<Point>) => ({
    cx: Number(value.x) + 0.5,
    cy: p - Number(value.y) - 0.5,
  });
  const dot = Math.max(0.35, p / 90);
  // Every dot gets its "kP" label while that stays readable; otherwise only the current one.
  const labelAll = p <= 100 && trail.length <= 40;
  const labelSize = Math.max(0.9, p / 26);
  // The dots of the walk so far (O has no dot), and their labels placed so none overlap.
  const walk = multiples
    .slice(0, shown)
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: NonNullable<Point>; index: number } => entry.value !== null);
  const placedLabels = placeLabels(
    walk.map((entry) => at(entry.value)),
    Math.max(0, walk.length - 1),
    p,
    dot,
    labelSize,
  ).map((label) => ({ ...label, multiple: walk[label.multiple - 1]!.index + 1 }));
  const labels = placedLabels.filter((label) => labelAll || label.multiple === shown);

  return (
    <div className="space-y-4" data-testid="multiples">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {playing && !finished ? (
            <Button variant="primary" icon="pause" onClick={() => setPlaying(false)}>
              Pause
            </Button>
          ) : (
            <Button
              variant="primary"
              icon="play"
              disabled={finished}
              onClick={() => setPlaying(true)}
            >
              Play
            </Button>
          )}
          <Button icon="chevronLeft" disabled={shown <= 1} onClick={() => jumpTo(shown - 1)}>
            Previous
          </Button>
          <Button icon="skipForward" disabled={finished} onClick={() => jumpTo(shown + 1)}>
            Next multiple
          </Button>
          <Button
            variant="ghost"
            icon="reset"
            onClick={() => {
              setShown(1);
              setPlaying(true);
            }}
          >
            Restart
          </Button>
        </div>
        <div className="w-60 shrink-0">
          <ChoiceGroup
            legend="Speed"
            options={[
              { id: 'slow', label: 'Slow' },
              { id: 'normal', label: 'Normal' },
              { id: 'fast', label: 'Fast' },
            ]}
            value={speed}
            onChange={setSpeed}
          />
        </div>
      </div>

      <div className={cx('grid gap-5', drawable && 'md:grid-cols-[auto_minmax(0,1fr)]')}>
        {drawable && (
          <figure className="m-0 min-w-0 md:w-[min(440px,50vh)]">
            <svg
              viewBox={`0 0 ${p} ${p}`}
              role="img"
              aria-label={`Multiples of P on the plot of ${grouped(background.length + 1)} points`}
              className="aspect-square w-full rounded-lg border border-line bg-sunken"
              data-testid="multiples-plot"
            >
              {background.map((value) => (
                <circle
                  key={`${value.x},${value.y}`}
                  {...at(value)}
                  r={dot * 0.7}
                  className="fill-line-strong"
                />
              ))}
              <polyline
                points={trail.map((value) => `${at(value).cx},${at(value).cy}`).join(' ')}
                fill="none"
                className="stroke-primary"
                strokeWidth={dot * 0.35}
                strokeLinejoin="round"
                opacity={0.55}
              />
              {trail.map((value, index) => (
                <circle key={index} {...at(value)} r={dot} className="fill-primary" />
              ))}
              {current !== null && (
                <circle
                  {...at(current)}
                  r={dot * 2}
                  className="fill-none stroke-point-r"
                  strokeWidth={dot * 0.6}
                />
              )}
              {labels.map((label) => {
                const isCurrent = label.multiple === shown;
                return (
                  <text
                    key={`label-${label.multiple}`}
                    x={label.x}
                    y={label.y}
                    textAnchor={label.anchor}
                    fontSize={labelSize}
                    className={isCurrent ? 'fill-point-r font-semibold' : 'fill-ink-soft'}
                    data-testid="multiples-label"
                  >
                    {label.multiple}P
                  </text>
                );
              })}
            </svg>
            <figcaption className="mt-1.5 text-note text-muted">
              The lines join each multiple to the next one, so they show the order of the walk P →
              2P → 3P …; they are not lines on the curve.
            </figcaption>
          </figure>
        )}

        <div className="min-w-0 space-y-3">
          <div
            className="rounded-xl border border-point-r/30 bg-point-r-soft px-4 py-3"
            aria-live="polite"
          >
            <p className="text-xs font-medium tracking-wide text-point-r uppercase">
              Multiple {grouped(shown)}
            </p>
            <p
              className="mt-1 font-mono text-lg font-semibold wrap-anywhere text-ink"
              data-testid="multiples-current"
            >
              {shown}P = {pointText(current, true)}
            </p>
          </div>

          {finished && (
            <p
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-soft"
              data-testid="multiples-summary"
            >
              {reachedInfinity ? (
                <>
                  {grouped(multiples.length)}P = O, so P has{' '}
                  <strong className="text-ink">order {grouped(multiples.length)}</strong>
                  {drawable &&
                    (multiples.length === background.length + 1
                      ? '. That is every point of the curve: P generates the whole group.'
                      : `. The curve has ${grouped(background.length + 1)} points, and ${grouped(multiples.length)} divides that number, as Lagrange’s theorem says it must.`)}
                </>
              ) : (
                <>
                  Stopped after {grouped(MAX_MULTIPLES)} multiples without reaching O. The order of
                  P on this curve is too large to reach one addition at a time; double-and-add
                  exists for exactly this reason.
                </>
              )}
            </p>
          )}

          <ol
            ref={listRef}
            className="relative max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 font-mono text-note"
            aria-label="Multiples of P; choose one to jump to it"
          >
            {multiples.map((value, index) => {
              const isCurrent = index === shown - 1;
              const reached = index < shown;
              return (
                <li key={index}>
                  <button
                    type="button"
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => jumpTo(index + 1)}
                    className={cx(
                      'w-full cursor-pointer rounded px-2 py-0.5 text-left wrap-anywhere transition-colors',
                      isCurrent
                        ? 'bg-primary-soft font-semibold text-ink'
                        : reached
                          ? 'text-ink-soft hover:bg-sunken'
                          : 'text-muted hover:bg-sunken hover:text-ink-soft',
                    )}
                    data-testid="multiples-item"
                  >
                    {index + 1}P = {pointText(value, true)}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
