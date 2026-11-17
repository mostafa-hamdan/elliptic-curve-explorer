/**
 * A save that a guest asked for before having an account. It is parked in the tab's
 * session storage while the guest signs in or signs up; afterwards the app returns to the
 * screen the guest came from and finishes the save there (see PendingSaveRunner).
 */
import type { SavedData } from './loadIntoExplorer.ts';

/** Key in the tab's session storage. Session storage ends when the tab is closed. */
const PENDING_SAVE_KEY = 'oncurve.pendingSave';

/** A parked save is dropped after this long, so an old intent never fires by surprise. */
export const PENDING_SAVE_MAX_AGE_MS = 30 * 60 * 1000;

/** What to save, and where to go back to. */
export interface PendingSave {
  kind: 'curve' | 'point';
  /** The name suggested in the Save dialog. */
  name: string;
  data: SavedData;
  /** The address of the screen the guest was on, for example "/explorer". */
  returnTo: string;
  /** When the guest clicked Save (milliseconds since 1970). */
  createdAt: number;
}

/**
 * Park a save for after signing in.
 *
 * @param save - the save, without its time stamp.
 * Errors from blocked storage are ignored: the guest can still sign in and save by hand.
 */
export function storePendingSave(save: Omit<PendingSave, 'createdAt'>): void {
  try {
    window.sessionStorage.setItem(
      PENDING_SAVE_KEY,
      JSON.stringify({ ...save, createdAt: Date.now() }),
    );
  } catch {
    // Storage blocked: nothing is parked.
  }
}

/**
 * Read the parked save, if there is a valid and recent one.
 *
 * @returns the save, or null when there is none, it is damaged or it is too old.
 */
export function readPendingSave(): PendingSave | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(PENDING_SAVE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingSave>;
    const valid =
      (value.kind === 'curve' || value.kind === 'point') &&
      typeof value.name === 'string' &&
      typeof value.data === 'object' &&
      value.data !== null &&
      // Only addresses inside this site: a value starting with "//" could point elsewhere.
      typeof value.returnTo === 'string' &&
      value.returnTo.startsWith('/') &&
      !value.returnTo.startsWith('//') &&
      typeof value.createdAt === 'number' &&
      Date.now() - value.createdAt < PENDING_SAVE_MAX_AGE_MS;
    if (!valid) {
      clearPendingSave();
      return null;
    }
    return value as PendingSave;
  } catch {
    clearPendingSave();
    return null;
  }
}

/** Forget the parked save. */
export function clearPendingSave(): void {
  try {
    window.sessionStorage.removeItem(PENDING_SAVE_KEY);
  } catch {
    // Storage blocked: there was nothing to forget.
  }
}

/**
 * Where to go right after signing in or signing up.
 *
 * @param fallback - the usual destination (the account page).
 * @returns the screen a parked save came from, or the fallback.
 */
export function pathAfterSignIn(fallback: string): string {
  return readPendingSave()?.returnTo ?? fallback;
}
