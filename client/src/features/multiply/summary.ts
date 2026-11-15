/**
 * Plain-English summary of a double-and-add run, kept apart from the screen code so it
 * can be unit-tested on its own.
 */
import type { MultiplicationTrace } from '@shared/ecc/index.ts';
import { count, grouped } from '../../lib/format.ts';

/**
 * One sentence comparing double-and-add with adding P one copy at a time.
 *
 * Adding P to itself one copy at a time needs |k| − 1 additions; double-and-add needs one
 * doubling per bit after the first, plus one addition per further 1 bit.
 *
 * @param trace - a multiplication with at least one table row.
 * @returns for example "4 bits: 3 doublings and 2 additions, instead of 12 additions one
 *          at a time." Counts of one use the singular.
 */
export function multiplySummary(trace: MultiplicationTrace): string {
  if (trace.magnitude === 1n) {
    return '1 bit: no doubling and no addition are needed, because 1 · P is P itself.';
  }
  const digits = trace.magnitude.toString().length;
  const work = `${count(trace.bits.length, 'bit')}: ${count(trace.doublings, 'doubling')} and ${count(
    trace.additions,
    'addition',
  )}`;
  // Up to 12 digits the naive count is still readable; beyond that only its size is.
  return digits <= 12
    ? `${work}, instead of ${count(trace.magnitude - 1n, 'addition')} one at a time.`
    : `${work}, instead of |k| − 1 additions one at a time, a ${grouped(digits)}-digit number.`;
}
