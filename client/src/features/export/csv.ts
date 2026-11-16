/**
 * Builds CSV files (comma-separated values, readable by Excel and any spreadsheet) from
 * results: the list of points, the steps of an addition, and the double-and-add table.
 * Numbers are written in full, never shortened.
 */
import type { AdditionTrace, Curve, MultiplicationTrace, Point } from '@shared/ecc/index.ts';
import type { PointList } from '../points/usePointListing.ts';

/**
 * Write one CSV field. Text with a comma, quote or line break is wrapped in quotes, and a
 * field that starts with = + − or @ gets a leading apostrophe so a spreadsheet shows it
 * as text instead of running it as a formula.
 *
 * @param value - the value to write.
 * @returns the field, safe to put in a CSV line.
 */
export function csvField(value: string | number | bigint): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Join rows of fields into CSV text with Windows line endings (what Excel expects). */
function toCsv(rows: Array<Array<string | number | bigint>>): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** "x" and "y" columns for a point; the point at infinity has none. */
function pointColumns(point: Point): [string, string] {
  return point === null ? ['', ''] : [point.x.toString(), point.y.toString()];
}

/** A short curve name for file names: "E23-1-1". Long parameters are left out. */
export function fileStem(curve: Curve): string {
  const short = curve.p.toString().length <= 12;
  return short ? `E${curve.p}-${curve.a}-${curve.b}` : `curve-${curve.p.toString(2).length}bit`;
}

/**
 * The list of all points: number, x, y. Row 1 is the point at infinity O.
 *
 * @param list - a finished point list.
 * @returns CSV text.
 */
export function pointsCsv(list: PointList): string {
  const rows: Array<Array<string | number>> = [['number', 'x', 'y', 'note']];
  rows.push([1, '', '', 'point at infinity O']);
  for (let index = 0; index < list.count; index += 1) {
    rows.push([index + 2, list.xs[index]!, list.ys[index]!, '']);
  }
  return toCsv(rows);
}

/**
 * The steps of one addition as "quantity, value" lines.
 *
 * @param curve - the curve it was computed on.
 * @param trace - the recorded addition.
 * @returns CSV text.
 */
export function additionCsv(curve: Curve, trace: AdditionTrace): string {
  const rows: Array<Array<string | bigint>> = [
    ['quantity', 'value'],
    ['p', curve.p],
    ['a', curve.a],
    ['b', curve.b],
    ['P', trace.p === null ? 'O' : `(${trace.p.x}, ${trace.p.y})`],
    ['Q', trace.q === null ? 'O' : `(${trace.q.x}, ${trace.q.y})`],
    ['rule', trace.kind],
  ];
  const slope = trace.slope;
  if (slope) {
    rows.push(
      ['numerator', slope.numeratorRaw],
      ['numerator mod p', slope.numerator],
      ['denominator', slope.denominatorRaw],
      ['denominator mod p', slope.denominator],
      ['inverse of denominator', slope.inverse.inverse ?? ''],
      ['lambda', slope.lambda],
      ['x3 before reduction', trace.x3Raw ?? ''],
      ['y3 before reduction', trace.y3Raw ?? ''],
    );
  }
  const [x, y] = pointColumns(trace.result);
  rows.push(['result', trace.result === null ? 'O' : `(${x}, ${y})`]);
  return toCsv(rows);
}

/**
 * The double-and-add table: one line per bit.
 *
 * @param trace - the recorded multiplication.
 * @returns CSV text.
 */
export function multiplyCsv(trace: MultiplicationTrace): string {
  const rows: Array<Array<string | number | bigint>> = [
    ['step', 'bit', 'operation', 'R equals', 'x of R', 'y of R'],
  ];
  for (const row of trace.rows) {
    const [x, y] = pointColumns(row.result);
    rows.push([row.index + 1, row.bit, row.operation, `${row.multiple}P`, x, y]);
  }
  const [x, y] = pointColumns(trace.result);
  rows.push(['result', '', `k = ${trace.k}`, trace.result === null ? 'O' : 'kP', x, y]);
  return toCsv(rows);
}
