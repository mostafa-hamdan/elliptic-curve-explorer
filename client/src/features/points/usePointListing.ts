/**
 * React hook that runs the point-listing worker for the current curve and exposes its
 * state: idle, running with progress, done with the points, or failed.
 * A finished list always belongs to one curve; when the curve changes it is discarded.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { LIST_POINTS_MAX_P, type Curve } from '@shared/ecc/index.ts';
import { curveKey } from '../../lib/format.ts';
import type { ListRequest, ListResponse } from './listingProtocol.ts';

/** A finished list of points. */
export interface PointList {
  /** The curve these points belong to. */
  curve: Curve;
  /** x coordinates; `xs[i]` goes with `ys[i]`. Sorted by x, then y. */
  xs: Uint32Array;
  /** y coordinates. */
  ys: Uint32Array;
  /** Number of ordinary points (the group has one more: O). */
  count: number;
  /** How long the search took, in milliseconds. */
  elapsedMs: number;
}

/** Where the listing stands for the current curve. */
export type ListingState =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'done'; list: PointList }
  | { status: 'error'; message: string };

/** What the hook returns. */
export interface PointListing {
  state: ListingState;
  /** True when the current curve is valid and small enough to list. */
  canList: boolean;
  /** Start listing the current curve. Does nothing if it cannot be listed. */
  start: () => void;
  /** Stop a running search and go back to idle. */
  cancel: () => void;
}

const IDLE: ListingState = { status: 'idle' };

/**
 * Manage the point listing for a curve.
 *
 * @param curve - the current curve, or null when the inputs are not a valid curve.
 * @returns the listing state and the functions to start and cancel it.
 */
export function usePointListing(curve: Curve | null): PointListing {
  const key = curveKey(curve);
  // The state remembers which curve it belongs to, so a result for an old curve can
  // never be shown for a new one, not even for a single frame.
  const [stored, setStored] = useState<{ key: string; state: ListingState }>({
    key,
    state: IDLE,
  });
  const workerRef = useRef<Worker | null>(null);

  /** Stop the worker, if one is running. */
  const stopWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  // A new curve (or leaving the page) makes any running search pointless.
  useEffect(() => stopWorker, [key, stopWorker]);

  const canList = curve !== null && curve.p <= LIST_POINTS_MAX_P;

  const start = useCallback(() => {
    if (curve === null || curve.p > LIST_POINTS_MAX_P) return;
    stopWorker();

    const worker = new Worker(new URL('./points.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setStored({ key, state: { status: 'running', progress: 0 } });

    worker.onmessage = (event: MessageEvent<ListResponse>) => {
      // Ignore late messages from a worker that has already been replaced.
      if (workerRef.current !== worker) return;
      const message = event.data;
      if (message.type === 'progress') {
        setStored({ key, state: { status: 'running', progress: message.done / message.total } });
        return;
      }
      stopWorker();
      if (message.type === 'done') {
        const list: PointList = {
          curve,
          xs: message.xs,
          ys: message.ys,
          count: message.xs.length,
          elapsedMs: message.elapsedMs,
        };
        setStored({ key, state: { status: 'done', list } });
      } else {
        setStored({ key, state: { status: 'error', message: message.message } });
      }
    };

    worker.onerror = (event) => {
      event.preventDefault();
      if (workerRef.current !== worker) return;
      stopWorker();
      setStored({
        key,
        state: {
          status: 'error',
          message: 'The background search could not run in this browser. Please try again.',
        },
      });
    };

    const request: ListRequest = {
      p: curve.p.toString(),
      a: curve.a.toString(),
      b: curve.b.toString(),
    };
    worker.postMessage(request);
  }, [curve, key, stopWorker]);

  const cancel = useCallback(() => {
    stopWorker();
    setStored({ key, state: IDLE });
  }, [key, stopWorker]);

  return { state: stored.key === key ? stored.state : IDLE, canList, start, cancel };
}
