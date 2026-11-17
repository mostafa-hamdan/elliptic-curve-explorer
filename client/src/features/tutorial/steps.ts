/**
 * The steps of the guided tour. Each step points at a part of the screen marked with a
 * `data-tour` attribute; a step whose part is not on screen is skipped, so the tour never
 * points at nothing.
 */
import type { ExplorerTab } from '../explorer/ExplorerContext.tsx';

/** One step of the tour. */
export interface TourStep {
  /** Value of the `data-tour` attribute to highlight; null for a centered message. */
  target: string | null;
  title: string;
  body: string;
  /** Explorer tab to show before highlighting, when the target lives in a tab. */
  tab?: ExplorerTab;
}

/** The tour, in order. */
export const TOUR_STEPS: ReadonlyArray<TourStep> = [
  {
    target: null,
    title: 'Welcome to OnCurve',
    body: 'OnCurve finds the points of an elliptic curve Ep(a, b), adds points and multiplies a point by a scalar, showing every step of the hand method. This short tour shows where everything is. It takes about a minute.',
  },
  {
    target: 'curve',
    title: 'Start with a curve',
    body: 'Type the prime p and the coefficients a and b. Each box is checked as you type: p must be a prime greater than 3, and the curve must not be singular. The green box confirms a valid curve.',
  },
  {
    target: 'presets',
    title: 'Or pick an example',
    body: 'The textbook curves from class come first, then two real 256-bit curves used on the internet: secp256k1 and NIST P-256.',
  },
  {
    target: 'tabs',
    title: 'Three tasks, three tabs',
    body: 'All points lists the curve. Add points computes P + Q. Multiply computes kP. The keys 1, 2 and 3 switch tabs too.',
  },
  {
    target: 'find-points',
    tab: 'points',
    title: 'Find every point',
    body: 'This runs in the background with a progress bar. You get a table, the count with Hasse’s bound, and a plot where you can hover over a point, zoom, and click to choose it as P or Q.',
  },
  {
    target: 'add-points',
    tab: 'add',
    title: 'Add two points',
    body: 'Type P and Q, or pick them from the list. Each point is checked against the curve equation, with both sides shown, before anything is calculated.',
  },
  {
    target: 'add-actions',
    tab: 'add',
    title: 'Calculate and read the steps',
    body: 'The result comes with the slope, the modular inverse by the extended Euclidean algorithm, and x₃ and y₃, just as you would write them by hand.',
  },
  {
    target: 'multiply-k',
    tab: 'multiply',
    title: 'Multiply by a scalar',
    body: 'Enter k and get the double-and-add table: one row per bit, and any row opens to show its own working. This works for 256-bit numbers too.',
  },
  {
    target: 'nav',
    title: 'Learn, practice and get help',
    body: 'Learn explains elliptic curves in pictures, Practice lets you solve steps by hand and checks them, and Help answers common questions.',
  },
  {
    target: 'assistant',
    title: 'Ask the assistant',
    body: 'The assistant answers questions about elliptic curves and explains your last result step by step. It works offline.',
  },
  {
    target: 'settings',
    title: 'Make it comfortable',
    body: 'Change the theme or the text size here, see the keyboard shortcuts, or replay this tour at any time.',
  },
];
