/**
 * Background worker that finds every point of a curve.
 * Listing a curve with p near 200,000 takes about a second; doing it here instead of on
 * the page keeps the screen responsive and lets a progress bar move while it runs.
 */
import { createCurve, isEccError, listPoints } from '@shared/ecc/index.ts';
import type { ListRequest, ListResponse } from './listingProtocol.ts';

/** The two worker features this file uses, typed for this message protocol. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<ListRequest>) => void) | null;
  postMessage(message: ListResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const started = performance.now();
  try {
    const { p, a, b } = event.data;
    // The curve is validated again here: a worker should never trust its input.
    const curve = createCurve(BigInt(p), BigInt(a), BigInt(b));
    const points = listPoints(curve, (done, total) => {
      scope.postMessage({ type: 'progress', done, total });
    });

    const xs = new Uint32Array(points.length);
    const ys = new Uint32Array(points.length);
    points.forEach((point, index) => {
      xs[index] = Number(point.x);
      ys[index] = Number(point.y);
    });

    // Passing the buffers in the transfer list hands them over without copying.
    scope.postMessage({ type: 'done', xs, ys, elapsedMs: performance.now() - started }, [
      xs.buffer,
      ys.buffer,
    ]);
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: isEccError(error)
        ? error.message
        : 'Something went wrong while listing the points. Please try again.',
    });
  }
};
