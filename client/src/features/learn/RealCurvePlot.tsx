/**
 * The real-number view: the smooth curve y² = x³ + ax + b with the chord-and-reflect
 * picture of P + Q. Sliders move P, Q and the coefficients, and the picture and the
 * numbers update at once. This is the geometry behind the mod p formulas.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { ChoiceGroup } from '../../components/ui/ChoiceGroup.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { curvePieces, isSingularReal, pointNear, realAdd, type RealPoint } from './realCurve.ts';

/** The visible part of the plane. */
const VIEW = { xMin: -3, xMax: 3.5, yMin: -5, yMax: 5 };
/** Size of the drawing in SVG units (it scales to the column width). */
const WIDTH = 480;
const HEIGHT = 480;

/** Screen position of a plane point. */
const sx = (x: number) => ((x - VIEW.xMin) / (VIEW.xMax - VIEW.xMin)) * WIDTH;
const sy = (y: number) => HEIGHT - ((y - VIEW.yMin) / (VIEW.yMax - VIEW.yMin)) * HEIGHT;

/** Format a real number with two decimals and a real minus sign. */
function fmt(value: number): string {
  const text = Math.abs(value) < 0.005 ? '0.00' : value.toFixed(2);
  return text.replace('-', '−');
}

/** Write a real point, or O. */
function pointLabel(point: RealPoint): string {
  return point === null ? 'O' : `(${fmt(point.x)}, ${fmt(point.y)})`;
}

interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

/** A labeled range slider with its current value. */
function Slider({ label, value, min, max, step, onChange }: SliderProps) {
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-note font-medium text-ink-soft">
          {label}
        </label>
        <span className="font-mono text-note text-ink">{fmt(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full cursor-pointer accent-primary"
      />
    </div>
  );
}

/** The interactive real-number picture with its controls and numbers. */
export function RealCurvePlot() {
  const [a, setA] = useState(-1);
  const [b, setB] = useState(1);
  const [xP, setXP] = useState(-1);
  // Chosen so that P, Q and −R are well apart and their labels do not overlap.
  const [xQ, setXQ] = useState(1.6);
  const [upperP, setUpperP] = useState(true);
  const [upperQ, setUpperQ] = useState(true);
  const [mode, setMode] = useState<'add' | 'double'>('add');

  const pieces = useMemo(() => curvePieces(a, b, VIEW.xMin, VIEW.xMax), [a, b]);
  const P = pointNear(a, b, xP, upperP, VIEW.xMin, VIEW.xMax);
  const Q = mode === 'double' ? P : pointNear(a, b, xQ, upperQ, VIEW.xMin, VIEW.xMax);
  const { sum, lambda, third } = realAdd(a, P, Q);
  const singular = isSingularReal(a, b);

  // The line through P and Q (or the tangent), drawn across the whole picture.
  let line: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (P && lambda !== null) {
    const at = (x: number) => P.y + lambda * (x - P.x);
    line = { x1: sx(VIEW.xMin), y1: sy(at(VIEW.xMin)), x2: sx(VIEW.xMax), y2: sy(at(VIEW.xMax)) };
  } else if (P && Q && sum === null) {
    // A vertical line: it meets the curve again only at infinity.
    line = { x1: sx(P.x), y1: 0, x2: sx(P.x), y2: HEIGHT };
  }

  const path = (piece: Array<[number, number]>) =>
    piece
      .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`)
      .join('') + 'Z';

  const inView = (point: RealPoint): point is NonNullable<RealPoint> =>
    point !== null &&
    point.x >= VIEW.xMin &&
    point.x <= VIEW.xMax &&
    point.y >= VIEW.yMin &&
    point.y <= VIEW.yMax;

  return (
    <div
      className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,240px)]"
      data-testid="real-curve"
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`The curve y² = x³ + ${fmt(a)}x + ${fmt(b)} over the real numbers, with P + Q = ${pointLabel(sum)}`}
        className="aspect-square w-full max-w-[480px] rounded-lg border border-line bg-sunken"
      >
        {/* Axes */}
        <line
          x1={0}
          y1={sy(0)}
          x2={WIDTH}
          y2={sy(0)}
          className="stroke-line-strong"
          strokeWidth={1}
        />
        <line
          x1={sx(0)}
          y1={0}
          x2={sx(0)}
          y2={HEIGHT}
          className="stroke-line-strong"
          strokeWidth={1}
        />
        {/* The curve */}
        {pieces.map((piece, index) => (
          <path
            key={index}
            d={path(piece)}
            className="fill-none stroke-ink-soft"
            strokeWidth={2.2}
          />
        ))}
        {/* The chord or tangent */}
        {line && <line {...line} className="stroke-primary" strokeWidth={1.6} opacity={0.8} />}
        {/* −R and the reflection to R */}
        {inView(third) && inView(sum) && (
          <>
            <line
              x1={sx(third.x)}
              y1={sy(third.y)}
              x2={sx(sum.x)}
              y2={sy(sum.y)}
              className="stroke-point-r"
              strokeWidth={1.6}
              strokeDasharray="5 4"
            />
            <circle
              cx={sx(third.x)}
              cy={sy(third.y)}
              r={6}
              className="fill-surface stroke-muted"
              strokeWidth={2}
            />
            <text
              x={sx(third.x) + 9}
              y={sy(third.y) - 8}
              className="fill-muted text-[13px] font-semibold"
            >
              −R
            </text>
          </>
        )}
        {inView(sum) && (
          <>
            <circle cx={sx(sum.x)} cy={sy(sum.y)} r={7} className="fill-point-r" />
            <text
              x={sx(sum.x) + 10}
              y={sy(sum.y) + 4}
              className="fill-point-r text-[14px] font-semibold"
            >
              R = P + Q
            </text>
          </>
        )}
        {inView(Q) && mode === 'add' && (
          <>
            <circle cx={sx(Q.x)} cy={sy(Q.y)} r={7} className="fill-point-q" />
            <text
              x={sx(Q.x) + 10}
              y={sy(Q.y) - 8}
              className="fill-point-q text-[14px] font-semibold"
            >
              Q
            </text>
          </>
        )}
        {inView(P) && (
          <>
            <circle cx={sx(P.x)} cy={sy(P.y)} r={7} className="fill-point-p" />
            <text
              x={sx(P.x) - 22}
              y={sy(P.y) - 8}
              className="fill-point-p text-[14px] font-semibold"
            >
              {mode === 'double' ? 'P = Q' : 'P'}
            </text>
          </>
        )}
      </svg>

      <div className="min-w-0 space-y-4">
        <ChoiceGroup
          legend="Operation"
          options={[
            { id: 'add', label: 'P + Q' },
            { id: 'double', label: '2P' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Slider
          label="x of P"
          value={P?.x ?? xP}
          min={VIEW.xMin}
          max={VIEW.xMax}
          step={0.05}
          onChange={setXP}
        />
        <label className="flex cursor-pointer items-center gap-2 text-note text-ink-soft">
          <input
            type="checkbox"
            checked={!upperP}
            onChange={(event) => setUpperP(!event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          P below the x-axis
        </label>
        {mode === 'add' && (
          <>
            <Slider
              label="x of Q"
              value={Q?.x ?? xQ}
              min={VIEW.xMin}
              max={VIEW.xMax}
              step={0.05}
              onChange={setXQ}
            />
            <label className="flex cursor-pointer items-center gap-2 text-note text-ink-soft">
              <input
                type="checkbox"
                checked={!upperQ}
                onChange={(event) => setUpperQ(!event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Q below the x-axis
            </label>
          </>
        )}
        <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
          <Slider label="a" value={a} min={-4} max={4} step={0.5} onChange={setA} />
          <Slider label="b" value={b} min={-4} max={4} step={0.5} onChange={setB} />
        </div>

        <dl
          className="space-y-1 rounded-lg border border-line bg-surface p-3 font-mono text-note"
          data-testid="real-numbers"
        >
          <div className="flex justify-between gap-2">
            <dt className="text-point-p">P</dt>
            <dd>{pointLabel(P)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-point-q">Q</dt>
            <dd>{pointLabel(Q)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">λ</dt>
            <dd>{lambda === null ? 'vertical' : fmt(lambda)}</dd>
          </div>
          <div className="flex justify-between gap-2 font-semibold">
            <dt className="text-point-r">R</dt>
            <dd data-testid="real-sum">{pointLabel(sum)}</dd>
          </div>
        </dl>
        {singular && (
          <Callout tone="warning" title="Singular curve">
            4a³ + 27b² = 0: the curve has a sharp point or crosses itself, and the addition breaks
            there.
          </Callout>
        )}
        {sum === null && P !== null && (
          <p className="text-note text-ink-soft">
            The line is vertical, so it meets the curve again only “at infinity”: the sum is O.
          </p>
        )}
      </div>
    </div>
  );
}
