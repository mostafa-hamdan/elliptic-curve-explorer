/**
 * The practice record (exercises tried and solved), kept in this browser and, when signed
 * in, copied to the account.
 */
import { announceProgress } from '../../lib/progress.ts';

/** Key in local storage for the practice record. */
export const PRACTICE_KEY_NAME = 'oncurve.practice';

/** How many exercises were tried and fully solved. */
export interface PracticeRecord {
  attempted: number;
  solved: number;
}

/**
 * Read the record, treating anything unexpected (or blocked storage) as a fresh start.
 *
 * @returns the record; solved is never more than attempted.
 */
export function readPracticeRecord(): PracticeRecord {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(PRACTICE_KEY_NAME) ?? '{}',
    ) as Partial<PracticeRecord>;
    const attempted =
      typeof value.attempted === 'number' && Number.isInteger(value.attempted)
        ? Math.max(0, value.attempted)
        : 0;
    const solved =
      typeof value.solved === 'number' && Number.isInteger(value.solved)
        ? Math.min(attempted, Math.max(0, value.solved))
        : 0;
    return { attempted, solved };
  } catch {
    return { attempted: 0, solved: 0 };
  }
}

/**
 * Save the record and announce the change so a signed-in account keeps a copy.
 *
 * @param record - the new record.
 */
export function savePracticeRecord(record: PracticeRecord): void {
  try {
    window.localStorage.setItem(PRACTICE_KEY_NAME, JSON.stringify(record));
  } catch {
    // Storage blocked: the counts still work for this visit.
  }
  announceProgress();
}
