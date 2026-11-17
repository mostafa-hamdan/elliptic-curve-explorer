/**
 * State of the guided tour: whether it is running and which step is showing. The tour
 * starts by itself on the first visit to the Explorer (see TourOverlay) and can be
 * replayed from the settings or the Help page.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { announceProgress } from '../../lib/progress.ts';

/** Key in the browser's local storage, set once the tour has been finished or skipped. */
export const TOUR_DONE_KEY = 'oncurve.tourDone';

interface TutorialContextValue {
  /** True while the tour is showing. */
  active: boolean;
  /** Index of the step that is showing. */
  stepIndex: number;
  /** Start the tour from the first step. */
  start: () => void;
  /** Move to a step. */
  goTo: (index: number) => void;
  /** End the tour (finished or skipped) and remember that it was seen. */
  finish: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

/** Has this browser already seen the tour? Errors (blocked storage) count as "seen". */
export function tourAlreadySeen(): boolean {
  try {
    return window.localStorage.getItem(TOUR_DONE_KEY) === '1';
  } catch {
    // Without storage the tour would start on every visit, which is worse than never.
    return true;
  }
}

/** Holds the tour state. Wrap the app in it once. */
export function TutorialProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    try {
      window.localStorage.setItem(TOUR_DONE_KEY, '1');
    } catch {
      // Storage blocked: the tour simply may show again on the next visit.
    }
    announceProgress();
  }, []);

  const value = useMemo(
    () => ({ active, stepIndex, start, goTo: setStepIndex, finish }),
    [active, stepIndex, start, finish],
  );
  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

/**
 * Read and control the tour.
 *
 * @throws when used outside {@link TutorialProvider}, which is a programming mistake.
 */
export function useTutorial(): TutorialContextValue {
  const value = useContext(TutorialContext);
  if (value === null) throw new Error('useTutorial must be used inside TutorialProvider.');
  return value;
}
