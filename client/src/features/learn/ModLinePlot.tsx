/**
 * The same chord-and-reflect idea mod p: on E23(1, 1), the "line" through P and Q is the
 * set of points y ≡ y₁ + λ(x − x₁) (mod p). It wraps around the square, but it still
 * meets the curve in exactly one more point, −R, and reflecting gives R = P + Q.
 */
import { useMemo, useState } from 'react';
import {
  addWithSteps,
  createCurve,
  listPoints,
  mod,
  negate,
  type AffinePoint,
} from '@shared/ecc/index.ts';
import { SelectField } from '../../components/ui/SelectField.tsx';
import { pointText } from '../../lib/format.ts';

/** The classroom curve used for the picture. */
const CURVE = createCurve(23n, 1n, 1n);
const POINTS = listPoints(CURVE);
const P_SIZE = 23;

/** Encode a point for a <select> value. */
const keyOf = (point: AffinePoint) => `${point.x},${point.y}`;

/** The mod p picture with two point pickers. */
export function ModLinePlot() {
  const [pKey, setPKey] = useState('3,10');
  const [qKey, setQKey] = useState('9,7');
  const P = POINTS.find((point) => keyOf(point) === pKey) ?? POINTS[0]!;
  const Q = POINTS.find((point) => keyOf(point) === qKey) ?? POINTS[1]!;

  const trace = useMemo(() => addWithSteps(CURVE, P, Q), [P, Q]);
  const R = trace.result;
  const minusR = R === null ? null : negate(CURVE, R);
  const lambda = trace.slope?.lambda ?? null;

  // The points of the "line" mod p: one for each x, wrapping around the square.
  const linePoints = useMemo(() => {
    if (lambda === null) return [];
    return Array.from({ length: P_SIZE }, (_, x) => ({
      x,
      y: Number(mod(P.y + lambda * (BigInt(x) - P.x), CURVE.p)),
    }));
  }, [lambda, P]);

  const cell = 20;
  const at = (x: number | bigint, y: number | bigint) => ({
    cx: (Number(x) + 0.5) * cell,
    cy: (P_SIZE - Number(y) - 0.5) * cell,
  });

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,240px)]" data-testid="mod-line">
      <svg
        viewBox={`0 0 ${P_SIZE * cell} ${P_SIZE * cell}`}
        role="img"
        aria-label={`E23(1, 1): the line through P and Q mod 23, and P + Q = ${pointText(R)}`}
        className="aspect-square w-full max-w-[480px] rounded-lg border border-line bg-sunken"
      >
        {linePoints.map((point) => (
          <circle
            key={`l${point.x}`}
            {...at(point.x, point.y)}
            r={5}
            className="fill-none stroke-primary"
            strokeWidth={1.4}
            opacity={0.6}
          />
        ))}
        {POINTS.map((point) => (
          <circle key={keyOf(point)} {...at(point.x, point.y)} r={3.2} className="fill-ink-soft" />
        ))}
        {R !== null && minusR !== null && (
          <>
            <line
              {...{
                x1: at(minusR.x, minusR.y).cx,
                y1: at(minusR.x, minusR.y).cy,
                x2: at(R.x, R.y).cx,
                y2: at(R.x, R.y).cy,
              }}
              className="stroke-point-r"
              strokeWidth={1.6}
              strokeDasharray="5 4"
            />
            <circle
              {...at(minusR.x, minusR.y)}
              r={7}
              className="fill-surface stroke-muted"
              strokeWidth={2}
            />
            <circle {...at(R.x, R.y)} r={7} className="fill-point-r" />
          </>
        )}
        <circle {...at(Q.x, Q.y)} r={7} className="fill-point-q" />
        <circle {...at(P.x, P.y)} r={7} className="fill-point-p" />
      </svg>

      <div className="min-w-0 space-y-4">
        <SelectField id="learn-mod-p" label="P" value={keyOf(P)} onChange={setPKey}>
          {POINTS.map((point) => (
            <option key={keyOf(point)} value={keyOf(point)}>
              {pointText(point)}
            </option>
          ))}
        </SelectField>
        <SelectField id="learn-mod-q" label="Q" value={keyOf(Q)} onChange={setQKey}>
          {POINTS.map((point) => (
            <option key={keyOf(point)} value={keyOf(point)}>
              {pointText(point)}
            </option>
          ))}
        </SelectField>
        <dl className="space-y-1 rounded-lg border border-line bg-surface p-3 font-mono text-note">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">λ</dt>
            <dd>{lambda === null ? '—' : lambda.toString()}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">−R</dt>
            <dd>{pointText(minusR)}</dd>
          </div>
          <div className="flex justify-between gap-2 font-semibold">
            <dt className="text-point-r">R = P + Q</dt>
            <dd data-testid="mod-sum">{pointText(R)}</dd>
          </div>
        </dl>
        <p className="text-note text-ink-soft">
          Hollow rings: the line y ≡ y₁ + λ(x − x₁) (mod 23). Filled dots: the curve. The line
          leaves the top and comes back at the bottom, yet it still passes through P, Q and −R.
        </p>
      </div>
    </div>
  );
}
