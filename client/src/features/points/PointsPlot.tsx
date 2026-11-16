/**
 * Interactive plot of all points of a curve, drawn on a canvas.
 * Hover over a dot to read its coordinates, click it to use it as P or Q, zoom with the
 * buttons (or Ctrl + mouse wheel) and drag to move around. When the visible range is too
 * wide for single dots to be told apart, the plot switches to a density view that shades
 * each small cell by how many points fall inside it; zooming in brings the dots back.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { curveName, type Point } from '@shared/ecc/index.ts';
import { Button } from '../../components/ui/Button.tsx';
import { ChoiceGroup } from '../../components/ui/ChoiceGroup.tsx';
import { count, grouped } from '../../lib/format.ts';
import { downloadCanvas } from '../../lib/download.ts';
import { fileStem } from '../export/csv.ts';
import { useTheme } from '../preferences/PreferencesContext.tsx';
import type { PointList } from './usePointListing.ts';

/** Up to this many values across, every point gets its own dot; wider views use density. */
export const SCATTER_MAX_P = 400;

/** Narrowest view allowed when zooming in, in field values across. */
const MIN_SPAN = 8;

/** A point to ring and label on the plot. */
export interface PlotHighlight {
  label: string;
  point: Point;
  /** Which token colour to use: P is blue, Q is amber. */
  role: 'p' | 'q';
}

interface PointsPlotProps {
  list: PointList;
  highlights: PlotHighlight[];
  /** Called when the user clicks a dot; the plot asks whether it should become P or Q. */
  onPick?: (which: 'P' | 'Q', point: Point) => void;
}

/** The part of the field that is visible: values x0 … x0 + span − 1 and y0 … y0 + span − 1. */
interface View {
  x0: number;
  y0: number;
  span: number;
}

/** A dot under the mouse pointer. */
interface Hover {
  x: number;
  y: number;
  /** Position of the dot inside the canvas, in CSS pixels. */
  px: number;
  py: number;
}

/** Space around the plotting square for the axis numbers, in CSS pixels. */
const MARGIN = { left: 44, right: 12, top: 12, bottom: 26 };

/**
 * Choose a round distance between axis ticks so there are about five of them.
 *
 * @param range - the length of the visible axis.
 * @returns a step of the form 1, 2 or 5 times a power of ten.
 */
export function tickStep(range: number): number {
  const raw = range / 5;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const scaled = raw / magnitude;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return Math.max(1, nice * magnitude);
}

/**
 * Keep a view inside the field: the span between the minimum and p, and the corner so
 * that the whole view stays within 0 … p − 1.
 *
 * @param view - the wanted view.
 * @param p - the size of the field.
 * @returns the corrected view, with whole-number corner and span.
 */
export function clampView(view: View, p: number): View {
  const span = Math.round(Math.min(p, Math.max(Math.min(MIN_SPAN, p), view.span)));
  const limit = p - span;
  return {
    span,
    x0: Math.round(Math.min(limit, Math.max(0, view.x0))),
    y0: Math.round(Math.min(limit, Math.max(0, view.y0))),
  };
}

/**
 * Read a colour token from the page, so the canvas follows the light or dark theme.
 *
 * @param name - the CSS variable, for example "--oc-primary".
 * @returns the colour value as text.
 */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The plot with its controls and caption. */
export function PointsPlot({ list, highlights, onPick }: PointsPlotProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ startX: number; startY: number; view: View; moved: boolean } | null>(null);
  const [size, setSize] = useState(0);
  const p = Number(list.curve.p);
  const [view, setView] = useState<View>({ x0: 0, y0: 0, span: p });
  const [hover, setHover] = useState<Hover | null>(null);
  const [pickTarget, setPickTarget] = useState<'P' | 'Q'>('P');
  const { theme } = useTheme();

  const density = view.span > SCATTER_MAX_P;
  const zoomed = view.span < p;
  const side = Math.max(0, size - MARGIN.left - MARGIN.right);
  const height = side + MARGIN.top + MARGIN.bottom;

  // Follow the width of the surrounding column; the plotting area is always a square.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setSize(Math.floor(Math.min(width, 560)));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  /** Pixel position of a field value inside the canvas (centre of its cell). */
  const toPixel = useCallback(
    (x: number, y: number) => ({
      px: MARGIN.left + ((x - view.x0 + 0.5) / view.span) * side,
      py: MARGIN.top + side - ((y - view.y0 + 0.5) / view.span) * side,
    }),
    [view, side],
  );

  // Draw everything whenever the data, the view, the size or the theme changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || side < 100) return;

    // Draw at the screen's real pixel density so dots stay sharp on high-DPI displays.
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, height);

    const { x0, y0, span } = view;
    const left = MARGIN.left;
    const top = MARGIN.top;
    const bottom = top + side;
    const colors = {
      line: token('--oc-line'),
      strong: token('--oc-line-strong'),
      muted: token('--oc-muted'),
      dot: token('--oc-primary'),
      sunken: token('--oc-sunken'),
      p: token('--oc-point-p'),
      q: token('--oc-point-q'),
      ink: token('--oc-ink'),
      surface: token('--oc-surface'),
    };
    const inView = (x: number, y: number) => x >= x0 && x < x0 + span && y >= y0 && y < y0 + span;

    context.fillStyle = colors.sunken;
    context.fillRect(left, top, side, side);

    // Grid lines and axis numbers, starting at the first round value inside the view.
    const step = tickStep(span);
    context.font = '11px "JetBrains Mono Variable", ui-monospace, monospace';
    context.fillStyle = colors.muted;
    context.strokeStyle = colors.line;
    context.lineWidth = 1;
    for (let value = Math.ceil(x0 / step) * step; value < x0 + span; value += step) {
      const x = Math.round(toPixel(value, 0).px) + 0.5;
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, bottom);
      context.stroke();
      context.textAlign = 'center';
      context.textBaseline = 'top';
      context.fillText(String(value), x, bottom + 6);
    }
    for (let value = Math.ceil(y0 / step) * step; value < y0 + span; value += step) {
      const y = Math.round(toPixel(0, value).py) + 0.5;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(left + side, y);
      context.stroke();
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      context.fillText(String(value), left - 6, y);
    }

    // The mirror line y = p/2: if (x, y) is a point then so is (x, p − y).
    const mirrorValue = (p - 1) / 2;
    if (mirrorValue >= y0 && mirrorValue < y0 + span) {
      context.save();
      context.setLineDash([5, 4]);
      context.strokeStyle = colors.strong;
      const mirror = Math.round(toPixel(0, mirrorValue).py) + 0.5;
      context.beginPath();
      context.moveTo(left, mirror);
      context.lineTo(left + side, mirror);
      context.stroke();
      context.restore();
    }

    if (density) {
      // Density view: count the points in each cell and shade by the count.
      const cells = Math.max(8, Math.min(span, Math.floor(side / 4)));
      const counts = new Uint32Array(cells * cells);
      let highest = 0;
      for (let index = 0; index < list.count; index += 1) {
        const x = list.xs[index]!;
        const y = list.ys[index]!;
        if (!inView(x, y)) continue;
        const cx = Math.min(cells - 1, Math.floor(((x - x0) / span) * cells));
        const cy = Math.min(cells - 1, Math.floor(((y - y0) / span) * cells));
        const value = (counts[cy * cells + cx]! += 1);
        if (value > highest) highest = value;
      }
      const cell = side / cells;
      context.fillStyle = colors.dot;
      for (let cy = 0; cy < cells; cy += 1) {
        for (let cx = 0; cx < cells; cx += 1) {
          const value = counts[cy * cells + cx]!;
          if (value === 0) continue;
          context.globalAlpha = 0.18 + 0.82 * (value / highest);
          context.fillRect(left + cx * cell, bottom - (cy + 1) * cell, cell + 0.5, cell + 0.5);
        }
      }
      context.globalAlpha = 1;
    } else {
      // Scatter view: one dot per point, sized to the room each value has.
      const radius = Math.max(1.6, Math.min(5, (side / span) * 0.36));
      context.fillStyle = colors.dot;
      context.beginPath();
      for (let index = 0; index < list.count; index += 1) {
        const x = list.xs[index]!;
        const y = list.ys[index]!;
        if (!inView(x, y)) continue;
        const { px, py } = toPixel(x, y);
        context.moveTo(px + radius, py);
        context.arc(px, py, radius, 0, Math.PI * 2);
      }
      context.fill();
    }

    // Frame on top so dots near the edge do not cover it.
    context.strokeStyle = colors.strong;
    context.strokeRect(left + 0.5, top + 0.5, side - 1, side - 1);

    // The dot under the mouse: a ring in the text colour.
    if (hover && inView(hover.x, hover.y)) {
      const { px, py } = toPixel(hover.x, hover.y);
      context.beginPath();
      context.arc(px, py, 7, 0, Math.PI * 2);
      context.lineWidth = 2;
      context.strokeStyle = colors.ink;
      context.stroke();
    }

    // Selected points: a ring and a letter.
    context.font = '600 12px "Inter Variable", system-ui, sans-serif';
    for (const highlight of highlights) {
      if (highlight.point === null) continue;
      const x = Number(highlight.point.x);
      const y = Number(highlight.point.y);
      if (!inView(x, y)) continue;
      const { px, py } = toPixel(x, y);
      const color = highlight.role === 'p' ? colors.p : colors.q;
      context.beginPath();
      context.arc(px, py, 7, 0, Math.PI * 2);
      context.fillStyle = colors.surface;
      context.fill();
      context.lineWidth = 2.5;
      context.strokeStyle = color;
      context.stroke();
      context.beginPath();
      context.arc(px, py, 2.5, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      // Keep the letter inside the square even for points near the right or top edge.
      const labelX = px + 12 > left + side - 10 ? px - 12 : px + 12;
      const labelY = py - 12 < top + 8 ? py + 14 : py - 12;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = color;
      context.fillText(highlight.label, labelX, labelY);
    }
  }, [list, highlights, size, height, side, theme, p, density, view, hover, toPixel]);

  /**
   * Find the dot nearest to a pointer position, if one is close enough to count as
   * "under the pointer". Only meaningful while single dots are drawn.
   */
  const dotAt = useCallback(
    (canvasX: number, canvasY: number): Hover | null => {
      if (density || side <= 0) return null;
      const reach = Math.max(7, (side / view.span) * 0.6);
      let best: Hover | null = null;
      let bestDistance = reach * reach;
      for (let index = 0; index < list.count; index += 1) {
        const x = list.xs[index]!;
        const y = list.ys[index]!;
        if (x < view.x0 || x >= view.x0 + view.span || y < view.y0 || y >= view.y0 + view.span) {
          continue;
        }
        const { px, py } = toPixel(x, y);
        const distance = (px - canvasX) ** 2 + (py - canvasY) ** 2;
        if (distance <= bestDistance) {
          bestDistance = distance;
          best = { x, y, px, py };
        }
      }
      return best;
    },
    [density, side, view, list, toPixel],
  );

  /** Pointer position inside the canvas, in CSS pixels. */
  function localPosition(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    drag.current = { startX: event.clientX, startY: event.clientY, view, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const active = drag.current;
    if (active && zoomed) {
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      // A few pixels of movement is still a click; more is a drag that moves the view.
      if (active.moved || Math.abs(dx) + Math.abs(dy) > 4) {
        active.moved = true;
        const perPixel = active.view.span / side;
        setView(
          clampView(
            {
              span: active.view.span,
              x0: active.view.x0 - dx * perPixel,
              y0: active.view.y0 + dy * perPixel,
            },
            p,
          ),
        );
        setHover(null);
        return;
      }
    }
    const position = localPosition(event);
    const found = dotAt(position.x, position.y);
    setHover((current) => (current?.x === found?.x && current?.y === found?.y ? current : found));
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const active = drag.current;
    drag.current = null;
    if (!active || active.moved || !onPick) return;
    const position = localPosition(event);
    const found = dotAt(position.x, position.y);
    if (found) onPick(pickTarget, { x: BigInt(found.x), y: BigInt(found.y) });
  }

  /**
   * Zoom by a factor around a point of the field, keeping that point where it is.
   *
   * @param factor - below 1 zooms in, above 1 zooms out.
   * @param centre - the field position to zoom around; defaults to the middle of the view.
   */
  const zoom = useCallback(
    (factor: number, centre?: { x: number; y: number }) => {
      setView((current) => {
        const cx = centre?.x ?? current.x0 + current.span / 2;
        const cy = centre?.y ?? current.y0 + current.span / 2;
        const span = current.span * factor;
        return clampView(
          {
            span,
            x0: cx - (cx - current.x0) * (span / current.span),
            y0: cy - (cy - current.y0) * (span / current.span),
          },
          p,
        );
      });
      setHover(null);
    },
    [p],
  );

  // Ctrl + wheel zooms around the pointer. Plain wheel keeps scrolling the page, so the
  // plot never traps someone who only wants to scroll past it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const fx = view.x0 + ((event.clientX - rect.left - MARGIN.left) / side) * view.span;
      const fy = view.y0 + ((MARGIN.top + side - (event.clientY - rect.top)) / side) * view.span;
      zoom(event.deltaY < 0 ? 0.8 : 1.25, { x: fx, y: fy });
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [view, side, zoom]);

  const description = `Plot of the ${count(list.count, 'point')} of ${curveName(list.curve)}${
    density ? ', shown as a density map' : ''
  }.`;
  const canZoomIn = view.span > Math.min(MIN_SPAN, p);

  return (
    <figure className="m-0 min-w-0">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        {onPick && (
          <div className="w-44">
            <ChoiceGroup
              legend="Clicking a dot sets"
              options={[
                { id: 'P', label: 'P' },
                { id: 'Q', label: 'Q' },
              ]}
              value={pickTarget}
              onChange={setPickTarget}
              testId="plot-pick-target"
            />
          </div>
        )}
        <div className="flex gap-1.5">
          <Button
            size="sm"
            icon="zoomIn"
            aria-label="Zoom in"
            title="Zoom in (or Ctrl + mouse wheel)"
            disabled={!canZoomIn}
            onClick={() => zoom(0.5)}
          />
          <Button
            size="sm"
            icon="zoomOut"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={!zoomed}
            onClick={() => zoom(2)}
          />
          <Button
            size="sm"
            icon="download"
            title="Save the plot as a PNG picture"
            onClick={() => {
              const canvas = canvasRef.current;
              if (canvas) {
                void downloadCanvas(
                  canvas,
                  token('--oc-surface'),
                  `oncurve-${fileStem(list.curve)}-plot.png`,
                ).catch(() => undefined);
              }
            }}
          >
            PNG
          </Button>
          <Button
            size="sm"
            icon="reset"
            disabled={!zoomed}
            onClick={() => {
              setView({ x0: 0, y0: 0, span: p });
              setHover(null);
            }}
          >
            Whole curve
          </Button>
        </div>
      </div>

      <div ref={frameRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={description}
          data-testid="points-plot"
          data-mode={density ? 'density' : 'scatter'}
          data-view={`${view.x0},${view.y0},${view.span}`}
          style={{ width: size, height, touchAction: zoomed ? 'none' : 'auto' }}
          className={zoomed ? 'block cursor-grab active:cursor-grabbing' : 'block'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setHover(null)}
        />
        {hover && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap text-ink shadow-pop"
            style={{
              left: Math.min(hover.px + 12, Math.max(0, size - 150)),
              top: Math.max(0, hover.py - 40),
            }}
            data-testid="plot-tooltip"
          >
            <span className="font-mono font-semibold">
              ({hover.x}, {hover.y})
            </span>
            {onPick && <span className="ml-1.5 text-muted">click: use as {pickTarget}</span>}
          </div>
        )}
      </div>

      <figcaption className="mt-1 text-note leading-snug text-muted">
        {density ? (
          <>
            <strong className="font-semibold text-ink-soft">Density view.</strong> Single dots would
            blur together at this size, so each cell is shaded by how many points fall inside it.
            Zoom in to see single points.
          </>
        ) : (
          <>
            Each dot is one point (x, y); hover to read it, click to choose it. The dashed line is y
            = p/2: every point (x, y) has a mirror image (x, p − y), which is its inverse.
          </>
        )}
        {zoomed && (
          <span className="mt-0.5 block" data-testid="plot-range">
            Showing x and y from {grouped(view.x0)} to {grouped(view.x0 + view.span - 1)} (x) and{' '}
            {grouped(view.y0)} to {grouped(view.y0 + view.span - 1)} (y). Drag to move around.
          </span>
        )}
      </figcaption>
    </figure>
  );
}
