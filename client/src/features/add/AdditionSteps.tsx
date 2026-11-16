/**
 * Shows one point addition the way it is solved by hand: which rule applies, the slope
 * λ, the modular inverse found with the extended Euclidean algorithm, then x₃ and y₃,
 * and finally a check that the answer is on the curve.
 * Used for P + Q in the Add tab and for every row of the double-and-add table.
 */
import type { ReactNode } from 'react';
import {
  curveSides,
  type AdditionTrace,
  type AffinePoint,
  type Curve,
  type InverseTrace,
  type SlopeSteps,
} from '@shared/ecc/index.ts';
import { plain, pointText, signed } from '../../lib/format.ts';

/** Names used for the two inputs and the answer, for example P, Q and R. */
export interface StepLabels {
  p: string;
  q: string;
  r: string;
}

const DEFAULT_LABELS: StepLabels = { p: 'P', q: 'Q', r: 'R' };

/** Euclid tables longer than this start folded, so 256-bit steps stay readable. */
const LONG_TABLE_ROWS = 12;

interface StepProps {
  /** Step number shown in the circle. */
  number: number;
  /** Short title of the step. */
  title: string;
  children: ReactNode;
}

/** One numbered step. */
function Step({ number, title, children }: StepProps) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-xs font-semibold text-primary"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <div className="mt-1 space-y-1 text-sm text-ink-soft">{children}</div>
      </div>
    </li>
  );
}

/** One line of working, in the number font. Long numbers wrap instead of overflowing. */
function Line({ children }: { children: ReactNode }) {
  return <p className="font-mono text-note leading-relaxed wrap-anywhere text-ink">{children}</p>;
}

/** The final value of a line, emphasised. */
function Answer({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-primary">{children}</strong>;
}

interface EuclidTableProps {
  inverse: InverseTrace;
}

/** The division lines of the extended Euclidean algorithm with the running coefficient. */
function EuclidTable({ inverse }: EuclidTableProps) {
  const table = (
    <div className="relative overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse font-mono text-note">
        <caption className="sr-only">
          Extended Euclidean algorithm for the inverse of {inverse.value.toString()} modulo{' '}
          {inverse.modulus.toString()}
        </caption>
        <thead>
          <tr className="bg-sunken text-left font-sans text-xs font-medium tracking-wide text-muted uppercase">
            <th scope="col" className="px-3 py-1.5">
              Division
            </th>
            <th scope="col" className="px-3 py-1.5">
              Coefficient t of the remainder
            </th>
          </tr>
        </thead>
        <tbody>
          {inverse.steps.map((step, index) => (
            <tr key={index} className="border-t border-line align-top text-ink">
              <td className="px-3 py-1.5 wrap-anywhere">
                {step.dividend.toString()} = {step.quotient.toString()} · {step.divisor.toString()}{' '}
                + {step.remainder.toString()}
              </td>
              <td className="px-3 py-1.5 wrap-anywhere">
                {plain(step.tDividend)} − {step.quotient.toString()} · {signed(step.tDivisor)} ={' '}
                {plain(step.tRemainder)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (inverse.steps.length <= LONG_TABLE_ROWS) return table;
  return (
    <details className="rounded-lg">
      <summary className="cursor-pointer rounded-md py-1 text-note font-medium text-primary">
        Show all {inverse.steps.length} division lines
      </summary>
      <div className="mt-2">{table}</div>
    </details>
  );
}

interface InverseStepProps {
  number: number;
  inverse: InverseTrace;
}

/** The step that finds denominator⁻¹ mod p. */
function InverseStep({ number, inverse }: InverseStepProps) {
  const d = inverse.value;
  const p = inverse.modulus;
  const answer = inverse.inverse ?? 0n;

  if (d === 1n) {
    return (
      <Step number={number} title="Inverse of the denominator">
        <p>The denominator is 1, and 1⁻¹ = 1, so there is nothing to compute.</p>
      </Step>
    );
  }

  // The line whose remainder is 1 carries the coefficient that is the inverse.
  const finalLine = inverse.steps.find((step) => step.remainder === 1n);
  const coefficient = finalLine?.tRemainder ?? answer;

  return (
    <Step number={number} title={`Inverse of ${d} modulo ${p} (extended Euclidean algorithm)`}>
      <p>
        Divide repeatedly until the remainder is 1. Next to each line keep a coefficient t. It
        starts at 0 for p and 1 for the denominator; each new t is the t from two lines earlier
        minus the quotient times the t from one line earlier.
      </p>
      <EuclidTable inverse={inverse} />
      <Line>
        The remainder 1 has t = {plain(coefficient)}
        {coefficient !== answer && (
          <>
            {' '}
            ≡ {answer.toString()} (mod {p.toString()})
          </>
        )}
        , so {d.toString()}⁻¹ ≡ <Answer>{answer.toString()}</Answer> (mod {p.toString()}).
      </Line>
      <Line>
        Check: {d.toString()} · {answer.toString()} = {(d * answer).toString()} ≡ 1 (mod{' '}
        {p.toString()}).
      </Line>
    </Step>
  );
}

interface SlopeLinesProps {
  curve: Curve;
  trace: AdditionTrace;
  slope: SlopeSteps;
  p1: AffinePoint;
  p2: AffinePoint;
}

/** The lines that set up λ as a fraction and reduce its top and bottom mod p. */
function SlopeLines({ curve, trace, slope, p1, p2 }: SlopeLinesProps) {
  const p = curve.p.toString();
  const changed =
    slope.numerator !== slope.numeratorRaw || slope.denominator !== slope.denominatorRaw;

  return (
    <>
      {trace.kind === 'chord' ? (
        <>
          <Line>λ = (y₂ − y₁) / (x₂ − x₁) mod p</Line>
          <Line>
            λ = ({p2.y.toString()} − {p1.y.toString()}) / ({p2.x.toString()} − {p1.x.toString()}) ={' '}
            {signed(slope.numeratorRaw)} / {signed(slope.denominatorRaw)}
          </Line>
        </>
      ) : (
        <>
          <Line>λ = (3x₁² + a) / (2y₁) mod p</Line>
          <Line>
            λ = (3 · {p1.x.toString()}² + {curve.a.toString()}) / (2 · {p1.y.toString()}) ={' '}
            {slope.numeratorRaw.toString()} / {slope.denominatorRaw.toString()}
          </Line>
        </>
      )}
      {changed && (
        <Line>
          Reduce mod {p}: {plain(slope.numeratorRaw)} ≡ {slope.numerator.toString()} and{' '}
          {plain(slope.denominatorRaw)} ≡ {slope.denominator.toString()}
        </Line>
      )}
      <Line>
        Dividing mod p means multiplying by the inverse: λ ≡ {slope.numerator.toString()} ·{' '}
        {slope.denominator.toString()}⁻¹ (mod {p})
      </Line>
    </>
  );
}

interface AdditionStepsProps {
  /** The curve the addition was done on. */
  curve: Curve;
  /** The recorded addition. */
  trace: AdditionTrace;
  /** Names for the inputs and the answer. Defaults to P, Q and R. */
  labels?: StepLabels;
}

/** The full written-out working for one addition. */
export function AdditionSteps({ curve, trace, labels = DEFAULT_LABELS }: AdditionStepsProps) {
  const p = curve.p.toString();
  const { p: nameP, q: nameQ, r: nameR } = labels;

  // The four cases that need no slope are explained in a single step.
  if (trace.kind === 'left-identity' || trace.kind === 'right-identity') {
    const other = trace.kind === 'left-identity' ? nameQ : nameP;
    const infinite = trace.kind === 'left-identity' ? nameP : nameQ;
    return (
      <ol className="space-y-4">
        <Step number={1} title={`${infinite} is the point at infinity`}>
          <p>
            O is the identity element of the group: adding it changes nothing. So {nameR} = {other}.
          </p>
          <Line>
            {nameR} = <Answer>{pointText(trace.result)}</Answer>
          </Line>
        </Step>
      </ol>
    );
  }

  const p1 = trace.p as AffinePoint;
  const p2 = trace.q as AffinePoint;

  if (trace.kind === 'inverses') {
    return (
      <ol className="space-y-4">
        <Step number={1} title={`${nameQ} is the inverse of ${nameP}`}>
          <p>
            Both points have the same x, and their y values add up to 0 mod p, so {nameQ} = −{nameP}
            .
          </p>
          <Line>
            y₁ + y₂ = {p1.y.toString()} + {p2.y.toString()} = {(p1.y + p2.y).toString()} ≡ 0 (mod{' '}
            {p})
          </Line>
          <p>
            The line through them is vertical and meets the curve again only at infinity, so the sum
            is the point at infinity.
          </p>
          <Line>
            {nameR} = <Answer>O</Answer>
          </Line>
        </Step>
      </ol>
    );
  }

  if (trace.kind === 'vertical-tangent') {
    return (
      <ol className="space-y-4">
        <Step number={1} title="Doubling a point with y = 0">
          <p>
            The two points are the same and y₁ = 0. The tangent slope (3x₁² + a) / (2y₁) would
            divide by zero: the tangent is vertical, so the result is the point at infinity.
          </p>
          <p>Such a point is its own inverse; it has order 2.</p>
          <Line>
            {nameR} = <Answer>O</Answer>
          </Line>
        </Step>
      </ol>
    );
  }

  // Chord or tangent: the full seven steps.
  const slope = trace.slope as SlopeSteps;
  const result = trace.result as AffinePoint;
  const x3Raw = trace.x3Raw ?? 0n;
  const y3Raw = trace.y3Raw ?? 0n;
  const lambda = slope.lambda.toString();
  const sides = curveSides(curve, result.x, result.y);
  const inverseValue = (slope.inverse.inverse ?? 0n).toString();

  return (
    <ol className="space-y-4">
      <Step number={1} title="Which rule applies">
        {trace.kind === 'chord' ? (
          <p>
            {nameP} and {nameQ} are different points with different x, so draw the chord through
            them. Here (x₁, y₁) = {pointText(p1)} and (x₂, y₂) = {pointText(p2)}.
          </p>
        ) : (
          <p>
            Both points are the same and y₁ ≠ 0, so this is a doubling: use the tangent at {nameP}.
            Here (x₁, y₁) = {pointText(p1)}.
          </p>
        )}
      </Step>

      <Step number={2} title="Slope λ as a fraction">
        <SlopeLines curve={curve} trace={trace} slope={slope} p1={p1} p2={p2} />
      </Step>

      <InverseStep number={3} inverse={slope.inverse} />

      <Step number={4} title="Slope λ">
        <Line>
          λ ≡ {slope.numerator.toString()} · {inverseValue} = {slope.product.toString()} ≡{' '}
          <Answer>{lambda}</Answer> (mod {p})
        </Line>
      </Step>

      <Step number={5} title="x₃">
        <Line>x₃ = λ² − x₁ − x₂ mod p</Line>
        <Line>
          x₃ = {lambda}² − {p1.x.toString()} − {p2.x.toString()} = {plain(x3Raw)} ≡{' '}
          <Answer>{result.x.toString()}</Answer> (mod {p})
        </Line>
      </Step>

      <Step number={6} title="y₃">
        <Line>y₃ = λ(x₁ − x₃) − y₁ mod p</Line>
        <Line>
          y₃ = {lambda} · ({p1.x.toString()} − {result.x.toString()}) − {p1.y.toString()} ={' '}
          {plain(y3Raw)} ≡ <Answer>{result.y.toString()}</Answer> (mod {p})
        </Line>
      </Step>

      <Step number={7} title="Result and check">
        <Line>
          {nameR} = <Answer>{pointText(result)}</Answer>
        </Line>
        <Line>
          On the curve: y₃² ≡ {sides.left.toString()} and x₃³ + a·x₃ + b ≡ {sides.right.toString()}{' '}
          (mod {p}).
        </Line>
      </Step>
    </ol>
  );
}
