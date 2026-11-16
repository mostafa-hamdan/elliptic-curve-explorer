/**
 * "Explain my last result": turns the engine's recorded steps into a short explanation in
 * plain English (with light markdown). Every number comes straight from the step data,
 * so the explanation can never disagree with what is on screen.
 */
import {
  curveName,
  type Curve,
  type AdditionTrace,
  type MultiplicationTrace,
} from '@shared/ecc/index.ts';
import { count, grouped, plain, pointText, shortNumber } from '../../lib/format.ts';
import { hasseCheck } from '@shared/ecc/index.ts';

/** A finished list of points, as far as an explanation needs it. */
export interface PointsSummary {
  curve: Curve;
  /** Number of ordinary points (O not included). */
  count: number;
}

/**
 * Explain one addition.
 *
 * @param curve - the curve it was computed on.
 * @param trace - the recorded addition.
 * @returns markdown text.
 */
export function explainAddition(curve: Curve, trace: AdditionTrace): string {
  const p = curve.p.toString();
  const head = `You computed **P + Q** on ${curveName(curve)} with P = \`${pointText(trace.p)}\` and Q = \`${pointText(trace.q)}\`. The answer is **${pointText(trace.result)}**.`;

  switch (trace.kind) {
    case 'left-identity':
    case 'right-identity':
      return `${head}\n\nOne of the two points is the point at infinity O. O is the identity of the group, so adding it changes nothing: the answer is simply the other point.`;
    case 'inverses':
      return `${head}\n\nP and Q have the same x and their y values add up to 0 mod ${p}, so Q = −P. The line through them is vertical and meets the curve again only "at infinity", which is why P + (−P) = O.`;
    case 'vertical-tangent':
      return `${head}\n\nP was doubled and its y is 0. The tangent slope (3x² + a) / (2y) would divide by 0: the tangent is vertical, so 2P = O. Such a point is its own inverse and has order 2.`;
    default:
      break;
  }

  const slope = trace.slope;
  if (!slope || trace.result === null || trace.p === null) return head;
  const inverse = slope.inverse.inverse ?? 0n;
  const rule =
    trace.kind === 'chord'
      ? 'P and Q are different points, so the **chord rule** applies: λ = (y₂ − y₁) / (x₂ − x₁).'
      : 'P was added to itself, so the **tangent rule** applies: λ = (3x₁² + a) / (2y₁).';

  return [
    head,
    rule,
    `1. The fraction for the slope is ${plain(slope.numeratorRaw)} / ${plain(slope.denominatorRaw)}, which is ${slope.numerator} / ${slope.denominator} after reducing mod ${p}.`,
    `2. Dividing mod ${p} means multiplying by an inverse. The extended Euclidean algorithm took ${count(slope.inverse.steps.length, 'division')} to find ${slope.denominator}⁻¹ ≡ ${inverse}.`,
    `3. So λ ≡ ${slope.numerator} · ${inverse} ≡ **${slope.lambda}** (mod ${p}).`,
    `4. x₃ = λ² − x₁ − x₂ ≡ **${trace.result.x}**, and y₃ = λ(x₁ − x₃) − y₁ ≡ **${trace.result.y}** (mod ${p}).`,
    'The last step on screen checks that the answer satisfies the curve equation, which it always must.',
  ].join('\n');
}

/**
 * Explain one scalar multiplication.
 *
 * @param curve - the curve it was computed on.
 * @param trace - the recorded multiplication.
 * @returns markdown text.
 */
export function explainMultiplication(curve: Curve, trace: MultiplicationTrace): string {
  const k = shortNumber(trace.k);
  const head = `You computed **${k}P** on ${curveName(curve)} with P = \`${pointText(trace.p, true)}\`. The answer is **${pointText(trace.result, true)}**.`;

  if (trace.magnitude === 0n) {
    return `${head}\n\nk = 0 means adding no copies of P at all, which leaves the identity element O.`;
  }
  if (trace.p === null) {
    return `${head}\n\nP is the point at infinity O, and any number of copies of O add up to O.`;
  }

  const lines = [
    head,
    `The app used **double-and-add**. ${trace.negated ? `Because k is negative, it multiplied −P by |k| instead, since (−k)P = k(−P). ` : ''}${trace.negated ? '|k|' : 'k'} in binary is \`${trace.bits.length <= 64 ? trace.bits : `${trace.bits.slice(0, 32)}…`}\` (${count(trace.bits.length, 'bit')}).`,
    '- The first bit is always 1 and starts the running result at R = P.',
    '- Every later bit doubles R. A 1 bit then also adds P.',
    `- In total: ${count(trace.doublings, 'doubling')} and ${count(trace.additions, 'addition')}.`,
  ];
  if (trace.result === null) {
    lines.push(
      `The result is O, so ${k} is a multiple of the **order** of P: the smallest n with nP = O divides ${k}.`,
    );
  }
  lines.push('Press **Show** on any row of the table to see the full working of that row.');
  return lines.join('\n');
}

/**
 * Explain a finished point listing.
 *
 * @param summary - the curve and its number of ordinary points.
 * @returns markdown text.
 */
export function explainPoints(summary: PointsSummary): string {
  const total = BigInt(summary.count + 1);
  const hasse = hasseCheck(summary.curve.p, total);
  return [
    `${curveName(summary.curve)} has **${grouped(total)} points**: ${count(summary.count, 'ordinary point')} plus the point at infinity O.`,
    `For each x from 0 to p − 1 the app computed x³ + ax + b mod p and used Euler's criterion to test whether it is a square. A non-zero square gives two points (x, y) and (x, p − y); 0 gives the single point (x, 0).`,
    `**Hasse's theorem** says |N − (p + 1)| ≤ 2√p. Here p + 1 = ${grouped(summary.curve.p + 1n)}, so N must lie between ${grouped(hasse.lower)} and ${grouped(hasse.upper)}, and it does.`,
  ].join('\n');
}
