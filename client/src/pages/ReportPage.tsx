/**
 * The printable report: everything calculated so far on the Explorer page (the curve, the
 * point count, the latest addition with all its steps, and the latest multiplication with
 * its table) laid out for paper. "Print or save as PDF" opens the browser's print dialog.
 */
import { Link } from 'react-router';
import { curveName, hasseCheck, type MultiplicationTrace } from '@shared/ecc/index.ts';
import { Button } from '../components/ui/Button.tsx';
import { Callout } from '../components/ui/Callout.tsx';
import { Card } from '../components/ui/Card.tsx';
import { AdditionSteps } from '../features/add/AdditionSteps.tsx';
import { useExplorer } from '../features/explorer/ExplorerContext.tsx';
import { multiplySummary } from '../features/multiply/summary.ts';
import { count, equationText, grouped, plain, pointText } from '../lib/format.ts';
import { EXPLORER_PATH } from '../lib/paths.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';

/** Above this many points the report lists only the count, not every point. */
const LIST_IN_REPORT = 200;

/** The double-and-add table without scrolling, so every row prints. */
function PrintableTable({ trace }: { trace: MultiplicationTrace }) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Double-and-add table</caption>
      <thead>
        <tr className="border-b border-line-strong text-left text-xs tracking-wide text-muted uppercase">
          <th scope="col" className="py-1.5 pr-3">
            Step
          </th>
          <th scope="col" className="py-1.5 pr-3">
            Bit
          </th>
          <th scope="col" className="py-1.5 pr-3">
            Operation
          </th>
          <th scope="col" className="py-1.5 pr-3">
            R
          </th>
          <th scope="col" className="py-1.5">
            Equals
          </th>
        </tr>
      </thead>
      <tbody className="font-mono text-note">
        {trace.rows.map((row) => (
          <tr key={row.index} className="border-b border-line align-top break-inside-avoid">
            <td className="py-1 pr-3">{row.index + 1}</td>
            <td className="py-1 pr-3">{row.bit}</td>
            <td className="py-1 pr-3 font-sans">
              {row.operation === 'start'
                ? 'R = P'
                : row.operation === 'double'
                  ? 'R ← 2R'
                  : 'R ← 2R + P'}
            </td>
            <td className="py-1 pr-3 wrap-anywhere">{pointText(row.result)}</td>
            <td className="py-1">
              {row.multiple.toString().length > 24 ? '…' : row.multiple.toString()}P
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The report page. */
export function ReportPage() {
  usePageTitle('Report');
  const { state, curveCheck, listing } = useExplorer();
  const curve = curveCheck.curve;
  const list = listing.state.status === 'done' ? listing.state.list : null;
  const add = state.addResult;
  const multiply = state.multiplyResult;
  const nothing = !list && !add && !multiply;
  const generated = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });

  return (
    <div className="mx-auto max-w-4xl space-y-5" data-testid="report">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">OnCurve report</h1>
          <p className="mt-1 text-muted">
            Generated {generated}. Every number was computed by OnCurve.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link
            to={EXPLORER_PATH}
            className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-sunken"
          >
            Back to the Explorer
          </Link>
          <Button
            variant="primary"
            icon="printer"
            onClick={() => window.print()}
            disabled={nothing}
          >
            Print or save as PDF
          </Button>
        </div>
      </div>

      {curve ? (
        <Card as="section" aria-labelledby="report-curve" className="p-5 print:shadow-none">
          <h2 id="report-curve" className="text-lg font-semibold text-ink">
            Curve{' '}
            {equationText(curve) ? curveName(curve) : `(${curve.p.toString(2).length}-bit prime)`}
          </h2>
          <dl className="mt-2 grid gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">p</dt>
            <dd className="wrap-anywhere text-ink">{curve.p.toString()}</dd>
            <dt className="text-muted">a</dt>
            <dd className="wrap-anywhere text-ink">{curve.a.toString()}</dd>
            <dt className="text-muted">b</dt>
            <dd className="wrap-anywhere text-ink">{curve.b.toString()}</dd>
          </dl>
          {equationText(curve) && (
            <p className="mt-2 font-mono text-sm text-ink-soft">{equationText(curve)}</p>
          )}
        </Card>
      ) : (
        <Callout tone="warning" title="No valid curve">
          The curve on the Explorer page is not valid, so there is nothing to report yet.
        </Callout>
      )}

      {nothing && curve && (
        <Callout tone="info" title="Nothing calculated yet" data-testid="report-empty">
          Find the points, add two points or multiply a point on the{' '}
          <Link to={EXPLORER_PATH} className="font-medium text-primary hover:underline">
            Explorer page
          </Link>
          ; the results then appear here, ready to print.
        </Callout>
      )}

      {list && (
        <Card as="section" aria-labelledby="report-points" className="p-5 print:shadow-none">
          <h2 id="report-points" className="text-lg font-semibold text-ink">
            All points
          </h2>
          {(() => {
            const total = BigInt(list.count + 1);
            const hasse = hasseCheck(list.curve.p, total);
            return (
              <p className="mt-1 text-sm text-ink-soft">
                N = {grouped(total)} points ({count(list.count, 'ordinary point')} plus O). Hasse’s
                bound {grouped(hasse.lower)} ≤ N ≤ {grouped(hasse.upper)} holds.
              </p>
            );
          })()}
          {list.count + 1 <= LIST_IN_REPORT ? (
            <p
              className="mt-3 font-mono text-note leading-relaxed text-ink"
              data-testid="report-points-list"
            >
              O,{' '}
              {Array.from(
                { length: list.count },
                (_, index) => `(${list.xs[index]}, ${list.ys[index]})`,
              ).join(', ')}
            </p>
          ) : (
            <p className="mt-3 text-note text-muted">
              The full list has more than {LIST_IN_REPORT} points; download it as CSV from the All
              points tab.
            </p>
          )}
        </Card>
      )}

      {add && (
        <Card
          as="section"
          aria-labelledby="report-add"
          className="p-5 break-before-page print:shadow-none"
        >
          <h2 id="report-add" className="text-lg font-semibold text-ink">
            Addition: {pointText(add.trace.p)} + {pointText(add.trace.q)} ={' '}
            <span data-testid="report-add-result">{pointText(add.trace.result)}</span>
          </h2>
          <div className="mt-4">
            <AdditionSteps curve={add.curve} trace={add.trace} />
          </div>
        </Card>
      )}

      {multiply && (
        <Card
          as="section"
          aria-labelledby="report-multiply"
          className="p-5 break-before-page print:shadow-none"
        >
          <h2 id="report-multiply" className="text-lg font-semibold wrap-anywhere text-ink">
            Multiplication: {plain(multiply.trace.k)} · {pointText(multiply.trace.p)} ={' '}
            <span data-testid="report-multiply-result">{pointText(multiply.trace.result)}</span>
          </h2>
          {multiply.trace.rows.length > 0 ? (
            <>
              <p className="mt-1 text-sm text-ink-soft">{multiplySummary(multiply.trace)}</p>
              <div className="mt-3">
                <PrintableTable trace={multiply.trace} />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">No table: the result is O directly.</p>
          )}
        </Card>
      )}
    </div>
  );
}
