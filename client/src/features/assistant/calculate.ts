/**
 * Simple calculations the offline helper answers by itself with the engine: adding two
 * points, doubling, multiplying by a scalar and "is this point on the curve?". The curve
 * comes from the question (E23(1, 1), or p = 23, a = 1, b = 1) or from the Explorer; points
 * come from the question, or are P and Q from the Explorer.
 */
import {
  addWithSteps,
  createCurve,
  curveName,
  curveSides,
  isEccError,
  makePoint,
  multiplyWithSteps,
  parseInteger,
  type Curve,
  type Point,
} from '@shared/ecc/index.ts';
import { pointText } from '../../lib/format.ts';

/** What the calculations may take from the user's current work. */
export interface CalculationContext {
  /** The Explorer's curve, or null when it is not valid. */
  curve: Curve | null;
  /** The Explorer's P and Q: undefined when not usable, null for O. */
  pointP?: Point | undefined;
  pointQ?: Point | undefined;
}

/** One whole number as typed: decimal or hexadecimal, maybe negative. */
const INT = String.raw`-?(?:0x[0-9a-f]+|\d+)`;
/**
 * A point (x, y), not glued to a name such as gcd(6, 23). A number in front is allowed, as in
 * 2(3, 10); the curve's own name, E23(1, 1), is removed before points are looked for.
 */
const PAIR = new RegExp(String.raw`(?<![\p{L}_])\(\s*(${INT})\s*,\s*(${INT})\s*\)`, 'gu');
/** A curve written the course's way: E23(1, 1). */
const CURVE_NAME = new RegExp(String.raw`\be\s*(${INT})\s*\(\s*(${INT})\s*,\s*(${INT})\s*\)`);
/** A curve given by its numbers: p = 23, a = 1, b = 1. */
const CURVE_FIELDS = new RegExp(
  String.raw`\bp\s*=\s*(${INT})[\s,;]+(?:and\s+)?a\s*=\s*(${INT})[\s,;]+(?:and\s+)?b\s*=\s*(${INT})`,
);

/** Subscript digits (E₂₃) and typographic signs, made plain. */
function plain(question: string): string {
  return question
    .toLowerCase()
    .replace(/[₀-₉]/g, (digit) => String(digit.charCodeAt(0) - 0x2080))
    .replace(/[−–]/g, '-')
    .replace(/[×·⋅]/g, '*')
    .replace(/\s+/g, ' ');
}

/** The result of a calculation request: an answer, or nothing to calculate. */
type Calculation = { text: string } | null;

/** Write a point for an answer. */
function show(point: Point): string {
  return pointText(point);
}

/**
 * Find the curve the question is about.
 *
 * @returns the curve, the text with the curve's own name removed (so its "(1, 1)" is not
 *          read as a point), or a message when the curve is not valid.
 */
function findCurve(
  text: string,
  context: CalculationContext,
): { curve: Curve; rest: string } | { problem: string; rest: string } | null {
  const match = text.match(CURVE_NAME) ?? text.match(CURVE_FIELDS);
  if (!match) return context.curve ? { curve: context.curve, rest: text } : null;
  try {
    const curve = createCurve(
      parseInteger(match[1]!, 'p'),
      parseInteger(match[2]!, 'a'),
      parseInteger(match[3]!, 'b'),
    );
    return { curve, rest: text.replace(match[0], ' ') };
  } catch (error) {
    return {
      problem: isEccError(error) ? error.message : 'That curve is not valid.',
      rest: text.replace(match[0], ' '),
    };
  }
}

/** Steps of an addition or doubling, as short lines. */
function additionText(curve: Curve, first: Point, second: Point): string {
  const trace = addWithSteps(curve, first, second);
  const doubling = trace.kind === 'doubling' || trace.kind === 'vertical-tangent';
  const head = doubling
    ? `**2 · ${show(trace.p)} = ${show(trace.result)}** on ${curveName(curve)}.`
    : `**${show(trace.p)} + ${show(trace.q)} = ${show(trace.result)}** on ${curveName(curve)}.`;
  switch (trace.kind) {
    case 'left-identity':
    case 'right-identity':
      return `${head}\n\nO is the identity, so adding it changes nothing.`;
    case 'inverses':
      return `${head}\n\nThe points are mirror images, (x, y) and (x, p − y): the line through them is vertical, so the sum is the point at infinity O.`;
    case 'vertical-tangent':
      return `${head}\n\nThe point has y = 0, so its tangent is vertical and doubling it gives O.`;
  }
  const slope = trace.slope!;
  const P = trace.p!;
  const Q = trace.q!;
  const R = trace.result!;
  const p = curve.p;
  const slopeLine = doubling
    ? `- Tangent slope: λ = (3x₁² + a)/(2y₁) = ${slope.numeratorRaw}/${slope.denominatorRaw} ≡ ${slope.numerator} · ${slope.denominator}⁻¹ (mod ${p})`
    : `- Chord slope: λ = (y₂ − y₁)/(x₂ − x₁) = ${slope.numeratorRaw}/${slope.denominatorRaw} ≡ ${slope.numerator} · ${slope.denominator}⁻¹ (mod ${p})`;
  return [
    head,
    '',
    slopeLine,
    `- Inverse (extended Euclid): ${slope.denominator}⁻¹ ≡ ${slope.inverse.inverse}, since ${slope.denominator} · ${slope.inverse.inverse} ≡ 1`,
    `- λ = ${slope.numerator} · ${slope.inverse.inverse} = ${slope.product} ≡ ${slope.lambda}`,
    `- x₃ = λ² − x₁ − x₂ = ${slope.lambda ** 2n} − ${P.x} − ${Q.x} = ${trace.x3Raw} ≡ ${R.x}`,
    `- y₃ = λ(x₁ − x₃) − y₁ = ${slope.lambda} · (${P.x - R.x}) − ${P.y} = ${trace.y3Raw} ≡ ${R.y}`,
  ].join('\n');
}

/** Steps of a scalar multiplication, as short lines. */
function multiplicationText(curve: Curve, k: bigint, point: Point): string {
  const trace = multiplyWithSteps(curve, k, point);
  const head = `**${k} · ${show(point)} = ${show(trace.result)}** on ${curveName(curve)}.`;
  if (trace.rows.length === 0) {
    return `${head}\n\n${k === 0n ? 'k = 0 adds no copies of the point, which leaves O.' : 'Any number of copies of O is O.'}`;
  }
  const shown = trace.rows.slice(0, 16).map((row) => {
    const what =
      row.operation === 'start'
        ? 'start, R = P'
        : row.operation === 'double'
          ? 'double'
          : 'double, then add P';
    return `- bit ${row.bit}: ${what} → ${row.multiple}P = ${show(row.result)}`;
  });
  const more = trace.rows.length > 16 ? [`- … ${trace.rows.length - 16} more bits`] : [];
  return [
    head,
    '',
    `Double-and-add with k = ${trace.bits}₂${trace.negated ? ' (k is negative, so the table uses −P)' : ''}: ${trace.doublings} doublings and ${trace.additions} additions.`,
    ...shown,
    ...more,
  ].join('\n');
}

/** Is the point on the curve? Both sides of the equation, either way. */
function onCurveText(curve: Curve, x: bigint, y: bigint): string {
  const { left, right } = curveSides(curve, x, y);
  const verdict = left === right ? '**Yes**' : '**No**';
  const point = `(${x}, ${y})`;
  return `${verdict}, ${point} is ${left === right ? '' : 'not '}on ${curveName(curve)}: y² mod p = ${left} and x³ + ax + b mod p = ${right}${left === right ? ', the same' : ', which differ'}.`;
}

/**
 * Answer a calculation question with the engine, if the question asks for one.
 *
 * @param question - what the user typed.
 * @param context - the Explorer's curve and points.
 * @returns the answer, or null when the question is not a calculation.
 */
export function answerCalculation(question: string, context: CalculationContext): Calculation {
  const text = plain(question);
  const curveInfo = findCurve(text, context);
  const rest = curveInfo ? curveInfo.rest : text;
  const pairs = [...rest.matchAll(PAIR)].map((match) => ({
    x: parseInteger(match[1]!, 'x'),
    y: parseInteger(match[2]!, 'y'),
    at: match.index ?? 0,
  }));

  // What is asked: decided from the words, before any point is checked.
  const asksOnCurve =
    /\bon (the |this |that )?(curve|e\s*-?\d)|\b(lie|lies|belong|belongs) (on|to)\b/.test(text) &&
    !/\+/.test(text);
  const asksAdd = /\+|\badd\b|\bsum\b/.test(rest);
  const asksDouble = /\bdoubl/.test(rest);
  const scalarBefore =
    pairs.length === 1
      ? rest.slice(0, pairs[0]!.at).match(new RegExp(String.raw`(${INT})\s*\*?\s*$`))
      : null;
  const scalarAfter = rest.match(new RegExp(String.raw`\b(?:by|times)\s+(${INT})\b`));
  const scalarWithP = rest.match(new RegExp(String.raw`(?:^|[^\w(])(${INT})\s*\*?\s*p\b`));

  // Which points: from the question, or P and Q from the Explorer.
  let points: Point[] = pairs.map((pair) => ({ x: pair.x, y: pair.y }));
  // "P" on its own or after a number ("5P"), but not inside a word such as "prime".
  const usesExplorerP = pairs.length === 0 && /(?:^|[^a-z])p\b/.test(rest);
  const usesExplorerQ = pairs.length === 0 && /(?:^|[^a-z])q\b/.test(rest);
  let kind: 'add' | 'double' | 'multiply' | 'on-curve' | null = null;
  let k = 0n;
  if (pairs.length === 2 && asksAdd) kind = 'add';
  else if (pairs.length === 1 && asksDouble) kind = 'double';
  else if (pairs.length === 1 && (scalarBefore || scalarAfter)) {
    kind = 'multiply';
    k = parseInteger((scalarBefore ?? scalarAfter)![1]!, 'k');
  } else if (pairs.length === 1 && asksOnCurve) kind = 'on-curve';
  else if (usesExplorerP && usesExplorerQ && /\bp\s*\+\s*q\b/.test(rest)) kind = 'add';
  else if (usesExplorerP && (asksDouble || /(?:^|[^\w])2\s*\*?\s*p\b/.test(rest))) kind = 'double';
  else if (usesExplorerP && scalarWithP) {
    kind = 'multiply';
    k = parseInteger(scalarWithP[1]!, 'k');
  } else if (usesExplorerP && asksOnCurve) kind = 'on-curve';
  if (kind === null) return null;

  if (curveInfo === null) {
    return {
      text: 'Which curve? Write it in the question, for example "(3, 10) + (9, 7) on E23(1, 1)", or set it up on the Explorer page first.',
    };
  }
  if ('problem' in curveInfo) return { text: curveInfo.problem };
  const { curve } = curveInfo;

  if (pairs.length === 0) {
    const explorerPoints = [context.pointP, ...(kind === 'add' ? [context.pointQ] : [])];
    if (explorerPoints.some((point) => point === undefined)) {
      return {
        text: 'P (and Q) on the Explorer page are not set to points of the curve yet. Fill them in, or write the points in the question, for example "2(3, 10) on E23(1, 1)".',
      };
    }
    points = explorerPoints as Point[];
  }

  try {
    if (kind === 'on-curve') {
      const point = points[0];
      if (point === null) return { text: 'Yes: the point at infinity O belongs to every curve.' };
      return { text: onCurveText(curve, point!.x, point!.y) };
    }
    // The engine refuses points that are not on the curve, with both sides in the message.
    const checked = points.map((point) =>
      point === null ? null : makePoint(curve, point.x, point.y),
    );
    if (kind === 'add') return { text: additionText(curve, checked[0]!, checked[1]!) };
    if (kind === 'double') return { text: additionText(curve, checked[0]!, checked[0]!) };
    // 2(x, y) is a doubling: show the tangent steps rather than a one-bit table.
    if (k === 2n) return { text: additionText(curve, checked[0]!, checked[0]!) };
    return { text: multiplicationText(curve, k, checked[0]!) };
  } catch (error) {
    return { text: isEccError(error) ? error.message : 'That calculation could not be done.' };
  }
}
