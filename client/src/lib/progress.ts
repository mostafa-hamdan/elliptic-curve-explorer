/**
 * A tiny signal that tour or practice progress changed. The parts of the app that keep
 * progress send it; the sign-in state listens and saves the progress in the account.
 * Keeping it here avoids those modules having to import each other.
 */

/** Name of the browser event used as the signal. */
export const PROGRESS_EVENT = 'oncurve:progress';

/** Announce that progress changed. */
export function announceProgress(): void {
  window.dispatchEvent(new Event(PROGRESS_EVENT));
}
