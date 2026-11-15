/**
 * The messages exchanged between the page and the background worker that lists every
 * point of a curve. Both sides import these types, so they cannot drift apart.
 */

/** Page → worker: list this curve. Numbers travel as decimal text. */
export interface ListRequest {
  p: string;
  a: string;
  b: string;
}

/** Worker → page. */
export type ListResponse =
  /** Sent about 100 times while working. */
  | { type: 'progress'; done: number; total: number }
  /**
   * Finished. The coordinates come as two flat arrays (xs[i], ys[i]) of 32-bit numbers:
   * p is at most 200,000, so every coordinate fits, and typed arrays move between the
   * worker and the page without being copied.
   */
  | { type: 'done'; xs: Uint32Array; ys: Uint32Array; elapsedMs: number }
  /** Something went wrong; the message is safe to show. */
  | { type: 'error'; message: string };
