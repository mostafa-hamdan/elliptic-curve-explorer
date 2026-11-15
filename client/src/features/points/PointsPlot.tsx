/**
 * Plot of all points of a curve on a canvas.
 * Small curves are drawn as one dot per point. When p is too large for single dots to
 * be told apart, the plot switches to a density view: the square is divided into cells
 * and each cell is shaded by how many points fall inside it.
 */
import { useEffect, useRef, useState } from 'react';
import { curveName, type Point } from '@shared/ecc/index.ts';
import { count } from '../../lib/format.ts';
import { useTheme } from '../theme/ThemeContext.tsx';
import type { PointList } from './usePointListing.ts';

/** Up to this p every point gets its own dot; above it the density view is used. */
export const SCATTER_MAX_P = 400;

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
}

/** Space around the plotting square for the axis numbers, in CSS pixels. */
const MARGIN = { left: 38, right: 12, top: 12, bottom: 26 };

/**
 * Choose a round distance between axis ticks so there are about five of them.
 *
 * @param range - the length of the axis (p).
 * @returns a step of the form 1, 2 or 5 times a power of ten.
 */
function tickStep(range: number): number {
  const raw = range / 5;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const scaled = raw / magnitude;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return Math.max(1, nice * magnitude);
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

/** The plot with its caption. */
export function PointsPlot({ list, highlights }: PointsPlotProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);
  const { theme } = useTheme();
  const p = Number(list.curve.p);
  const density = p > SCATTER_MAX_P;
  // The plotting area is a square; the canvas is slightly less tall than wide because
  // the left margin (for the y numbers) is wider than the bottom one.
  const height = Math.max(0, size - MARGIN.left - MARGIN.right + MARGIN.top + MARGIN.bottom);

  // Follow the width of the surrounding column; the plot is always a square.
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || size < 120) return;

    // Draw at the screen's real pixel density so dots stay sharp on high-DPI displays.
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, height);

    const side = size - MARGIN.left - MARGIN.right;
    const top = MARGIN.top;
    const left = MARGIN.left;
    const bottom = top + side;
    // Each value owns a cell of width side / p; a point sits in the middle of its cell.
    const toX = (x: number) => left + ((x + 0.5) / p) * side;
    const toY = (y: number) => bottom - ((y + 0.5) / p) * side;

    const colors = {
      line: token('--oc-line'),
      strong: token('--oc-line-strong'),
      muted: token('--oc-muted'),
      dot: token('--oc-primary'),
      sunken: token('--oc-sunken'),
      p: token('--oc-point-p'),
      q: token('--oc-point-q'),
      surface: token('--oc-surface'),
    };

    // Background and frame.
    context.fillStyle = colors.sunken;
    context.fillRect(left, top, side, side);

    // Grid lines and axis numbers.
    const step = tickStep(p);
    context.font = '11px "JetBrains Mono Variable", ui-monospace, monospace';
    context.fillStyle = colors.muted;
    context.strokeStyle = colors.line;
    context.lineWidth = 1;
    for (let value = 0; value < p; value += step) {
      const x = Math.round(toX(value)) + 0.5;
      const y = Math.round(toY(value)) + 0.5;
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, bottom);
      context.moveTo(left, y);
      context.lineTo(left + side, y);
      context.stroke();
      context.textAlign = 'center';
      context.textBaseline = 'top';
      context.fillText(String(value), x, bottom + 6);
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      context.fillText(String(value), left - 6, y);
    }

    // The mirror line y = p/2: if (x, y) is a point then so is (x, p − y).
    context.save();
    context.setLineDash([5, 4]);
    context.strokeStyle = colors.strong;
    const mirror = Math.round(bottom - side / 2) + 0.5;
    context.beginPath();
    context.moveTo(left, mirror);
    context.lineTo(left + side, mirror);
    context.stroke();
    context.restore();

    if (density) {
      // Density view: count the points in each cell and shade by the count.
      const cells = Math.max(8, Math.min(p, Math.floor(side / 4)));
      const counts = new Uint32Array(cells * cells);
      let highest = 0;
      for (let index = 0; index < list.count; index += 1) {
        const cx = Math.min(cells - 1, Math.floor((list.xs[index]! / p) * cells));
        const cy = Math.min(cells - 1, Math.floor((list.ys[index]! / p) * cells));
        const count = (counts[cy * cells + cx]! += 1);
        if (count > highest) highest = count;
      }
      const cell = side / cells;
      context.fillStyle = colors.dot;
      for (let cy = 0; cy < cells; cy += 1) {
        for (let cx = 0; cx < cells; cx += 1) {
          const count = counts[cy * cells + cx]!;
          if (count === 0) continue;
          context.globalAlpha = 0.18 + 0.82 * (count / highest);
          context.fillRect(left + cx * cell, bottom - (cy + 1) * cell, cell + 0.5, cell + 0.5);
        }
      }
      context.globalAlpha = 1;
    } else {
      // Scatter view: one dot per point, sized to the room each value has.
      const radius = Math.max(1.4, Math.min(5, (side / p) * 0.36));
      context.fillStyle = colors.dot;
      context.beginPath();
      for (let index = 0; index < list.count; index += 1) {
        const x = toX(list.xs[index]!);
        const y = toY(list.ys[index]!);
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, Math.PI * 2);
      }
      context.fill();
    }

    // Frame on top so dots near the edge do not cover it.
    context.strokeStyle = colors.strong;
    context.strokeRect(left + 0.5, top + 0.5, side - 1, side - 1);

    // Selected points: a ring and a letter.
    context.font = '600 12px "Inter Variable", system-ui, sans-serif';
    for (const highlight of highlights) {
      if (highlight.point === null) continue;
      const x = toX(Number(highlight.point.x));
      const y = toY(Number(highlight.point.y));
      const color = highlight.role === 'p' ? colors.p : colors.q;
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.fillStyle = colors.surface;
      context.fill();
      context.lineWidth = 2.5;
      context.strokeStyle = color;
      context.stroke();
      context.beginPath();
      context.arc(x, y, 2.5, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      // Keep the letter inside the square even for points near the right or top edge.
      const labelX = x + 12 > left + side - 10 ? x - 12 : x + 12;
      const labelY = y - 12 < top + 8 ? y + 14 : y - 12;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = color;
      context.fillText(highlight.label, labelX, labelY);
    }
  }, [list, highlights, size, height, theme, p, density]);

  const description = `Plot of the ${count(list.count, 'point')} of ${curveName(list.curve)}${
    density ? ', shown as a density map' : ''
  }.`;

  return (
    <figure className="m-0">
      <div ref={frameRef} className="w-full">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={description}
          data-testid="points-plot"
          data-mode={density ? 'density' : 'scatter'}
          style={{ width: size, height }}
          className="block"
        />
      </div>
      <figcaption className="mt-1 text-[13px] leading-snug text-muted">
        {density ? (
          <>
            <strong className="font-semibold text-ink-soft">Density view.</strong> With p above{' '}
            {SCATTER_MAX_P}, single dots would blur together, so each cell is shaded by how many
            points fall inside it.
          </>
        ) : (
          <>
            Each dot is one point (x, y). The dashed line is y = p/2: every point (x, y) has a
            mirror image (x, p − y), which is its inverse.
          </>
        )}
      </figcaption>
    </figure>
  );
}
