/**
 * The "Multiply" tab: compute kP with the double-and-add method and show the table
 * (bit, operation, running result). Any row can be opened to see the full working of
 * its doubling and its addition. Works for textbook curves and for 256-bit curves.
 */
import { Fragment, useMemo, useState, type FormEvent } from 'react';
import {
  addWithSteps,
  isEccError,
  multiplyWithSteps,
  pointsEqual,
  type Curve,
  type MultiplicationTrace,
  type MultiplyRow,
} from '@shared/ecc/index.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { Dialog } from '../../components/ui/Dialog.tsx';
import { CardHeader } from '../../components/ui/Card.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { TextField } from '../../components/ui/TextField.tsx';
import { cx } from '../../lib/cx.ts';
import { plain, pointText, shortNumber } from '../../lib/format.ts';
import { AdditionSteps } from '../add/AdditionSteps.tsx';
import { useAuth } from '../auth/AuthContext.tsx';
import { useExplorer } from '../explorer/ExplorerContext.tsx';
import { PointInput } from '../explorer/PointInput.tsx';
import { ResultHeader } from '../explorer/ResultHeader.tsx';
import { checkPoint, checkScalar, pointProblem } from '../explorer/validation.ts';
import { MultiplesAnimation } from './MultiplesAnimation.tsx';
import { multiplySummary } from './summary.ts';
import { fileStem, multiplyCsv } from '../export/csv.ts';
import { ResultActions } from '../export/ResultActions.tsx';

/** What each kind of row does, in words. */
const OPERATION_TEXT: Record<MultiplyRow['operation'], string> = {
  start: 'Start: R = P',
  double: 'Double: R ← 2R',
  'double-add': 'Double, then add P: R ← 2R + P',
};

interface RowDetailProps {
  curve: Curve;
  trace: MultiplicationTrace;
  row: MultiplyRow;
}

/** The written-out working for one table row: its doubling and, for a 1 bit, its addition. */
function RowDetail({ curve, trace, row }: RowDetailProps) {
  if (row.operation === 'start') {
    return (
      <p className="text-sm text-ink-soft">
        The leading bit of k is always 1, so the running result simply starts as R = P ={' '}
        <span className="font-mono break-all text-ink">{pointText(trace.base)}</span>.
      </p>
    );
  }

  const doubling = addWithSteps(curve, row.before, row.before);
  const adding =
    row.operation === 'double-add' ? addWithSteps(curve, row.doubled, trace.base) : null;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">
          Doubling: 2R, with R = <span className="font-mono">{pointText(row.before, true)}</span>
        </h4>
        <AdditionSteps curve={curve} trace={doubling} labels={{ p: 'R', q: 'R', r: '2R' }} />
      </div>
      {adding && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink">
            Adding P: 2R + P, with 2R ={' '}
            <span className="font-mono">{pointText(row.doubled, true)}</span>
          </h4>
          <AdditionSteps curve={curve} trace={adding} labels={{ p: '2R', q: 'P', r: '2R + P' }} />
        </div>
      )}
    </div>
  );
}

interface MultiplyTableProps {
  curve: Curve;
  trace: MultiplicationTrace;
}

/** The double-and-add table, one row per bit of k, read from the left. */
function MultiplyTable({ curve, trace }: MultiplyTableProps) {
  // Only one row is open at a time, which keeps a 256-row table manageable.
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    // `relative` keeps the screen-reader-only captions inside this scroll area. Without
    // it they are positioned against the page and stretch it far below the footer.
    <div className="relative max-h-[560px] overflow-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm" data-testid="multiply-table">
        <caption className="sr-only">
          Double-and-add table for {plain(trace.k)} times P, one row per bit
        </caption>
        <thead className="sticky top-0 z-10">
          <tr className="bg-sunken text-left text-xs font-medium tracking-wide text-muted uppercase">
            <th scope="col" className="w-14 px-3 py-2">
              Step
            </th>
            <th scope="col" className="w-12 px-3 py-2">
              Bit
            </th>
            <th scope="col" className="px-3 py-2">
              Operation
            </th>
            <th scope="col" className="px-3 py-2">
              Running result R
            </th>
            <th scope="col" className="px-3 py-2">
              R equals
            </th>
            <th scope="col" className="w-24 px-3 py-2 text-right">
              Working
            </th>
          </tr>
        </thead>
        <tbody>
          {trace.rows.map((row) => {
            const open = openIndex === row.index;
            return (
              <Fragment key={row.index}>
                <tr className={cx('border-t border-line align-top', open && 'bg-primary-soft/40')}>
                  <td className="px-3 py-2 font-mono text-note text-muted">{row.index + 1}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cx(
                        'inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-note font-semibold',
                        row.bit === 1 ? 'bg-primary-soft text-primary' : 'bg-sunken text-ink-soft',
                      )}
                    >
                      {row.bit}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{OPERATION_TEXT[row.operation]}</td>
                  <td className="px-3 py-2 font-mono text-note break-all text-ink">
                    {pointText(row.result, true)}
                  </td>
                  <td className="px-3 py-2 font-mono text-note break-all text-ink-soft">
                    {shortNumber(row.multiple)}P
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={`${open ? 'Hide' : 'Show'} the working for step ${row.index + 1}`}
                      onClick={() => setOpenIndex(open ? null : row.index)}
                      className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-line bg-surface px-2 text-xs font-medium text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
                    >
                      {open ? 'Hide' : 'Show'}
                      <Icon
                        name="chevronDown"
                        size={13}
                        className={cx('transition-transform', open && 'rotate-180')}
                      />
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr className="border-t border-line bg-surface">
                    <td colSpan={6} className="px-4 py-4" data-testid="multiply-row-detail">
                      <RowDetail curve={curve} trace={trace} row={row} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface MultiplyResultProps {
  curve: Curve;
  trace: MultiplicationTrace;
}

/** Result headline, the summary of the method, and the table. */
function MultiplyResult({ curve, trace }: MultiplyResultProps) {
  const kText = plain(trace.k);
  const expression =
    trace.k < 0n ? `(${shortNumber(trace.k).replace('-', '−')})P` : `${shortNumber(trace.k)}P`;

  return (
    <section
      aria-label="Multiplication result"
      className="space-y-4"
      data-testid="multiply-result-section"
    >
      <ResultHeader
        expression={expression}
        result={trace.result}
        rule="Double-and-add"
        testId="multiply-result"
        detail={
          <span className="font-mono break-all">
            k = {kText}, P = {pointText(trace.p)}
          </span>
        }
      />
      <ResultActions
        csvLabel="Download table (CSV)"
        testId="multiply-export"
        makeCsv={() => ({
          text: multiplyCsv(trace),
          filename: `oncurve-${fileStem(curve)}-multiply.csv`,
        })}
      />

      {trace.rows.length === 0 ? (
        <Callout tone="info" title="No table needed" data-testid="multiply-trivial">
          {trace.magnitude === 0n
            ? 'k = 0 means adding no copies of P at all, which gives the identity element: 0 · P = O.'
            : 'P is the point at infinity O. Adding O to itself any number of times is still O: k · O = O.'}
        </Callout>
      ) : (
        <>
          <div className="rounded-xl border border-line p-4 text-sm text-ink-soft">
            <h3 className="mb-2 text-base font-semibold text-ink">How the table is built</h3>
            {trace.negated && (
              <p className="mb-2" data-testid="multiply-negated">
                k is negative, and (−k)P = k(−P). So the table uses |k| ={' '}
                <span className="font-mono break-all text-ink">{trace.magnitude.toString()}</span>{' '}
                and the inverse point −P ={' '}
                <span className="font-mono break-all text-ink">{pointText(trace.base)}</span> in
                place of P.
              </p>
            )}
            <p>
              Write {trace.negated ? '|k|' : 'k'} in binary and read the bits from the left. The
              first bit sets R = P. Every later bit doubles R; a 1 bit then also adds P.
            </p>
            <p className="mt-2 font-mono text-note break-all text-ink" data-testid="multiply-bits">
              {trace.magnitude.toString().length <= 40 && <>{trace.magnitude.toString()} = </>}
              {trace.bits}
              <sub>2</sub>
            </p>
            <p className="mt-2" data-testid="multiply-summary">
              {multiplySummary(trace)}
            </p>
          </div>
          <MultiplyTable curve={curve} trace={trace} />
        </>
      )}
    </section>
  );
}

/** The whole "Multiply" tab. */
export function MultiplyTab() {
  const { state, curveCheck, setPoint, setScalar, setMultiplyResult } = useExplorer();
  const { recordHistory } = useAuth();
  const curve = curveCheck.curve;
  // Empty boxes only show "enter a value" after the user has tried to calculate.
  const [attempted, setAttempted] = useState(false);
  // A problem message belongs to the inputs it was raised for; editing anything hides it.
  const inputsKey = JSON.stringify([state.p, state.a, state.b, state.pointP, state.k]);
  const [raised, setRaised] = useState<{ key: string; message: string } | null>(null);
  const problem = raised !== null && raised.key === inputsKey ? raised.message : null;
  const setProblem = (message: string | null) =>
    setRaised(message === null ? null : { key: inputsKey, message });

  const checkP = useMemo(() => checkPoint(curve, state.pointP, 'P'), [curve, state.pointP]);
  const [animating, setAnimating] = useState(false);
  const checkK = useMemo(() => checkScalar(state.k), [state.k]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (!curve) {
      setProblem('Set up a valid curve on the left first.');
      return;
    }
    const firstProblem =
      pointProblem(checkP, 'P') ?? (checkK.value === null ? checkK.message : null);
    if (firstProblem !== null || checkP.point === undefined || checkK.value === null) {
      setProblem(firstProblem);
      return;
    }
    try {
      const trace = multiplyWithSteps(curve, checkK.value, checkP.point);
      setMultiplyResult({ curve, trace });
      // Signed-in users get the calculation in their history (guests: nothing is sent).
      recordHistory({
        operation: 'multiply',
        input: {
          p: state.p.trim(),
          a: state.a.trim(),
          b: state.b.trim(),
          px: state.pointP.x.trim(),
          py: state.pointP.y.trim(),
          pInfinity: state.pointP.infinity,
          k: state.k.trim(),
        },
        result: pointText(trace.result),
      });
      setProblem(null);
    } catch (error) {
      if (!isEccError(error)) throw error;
      setProblem(error.message);
    }
  }

  const result = state.multiplyResult;
  // The result stays on screen while the inputs are edited; say so when they differ.
  const stale =
    result !== null &&
    checkP.point !== undefined &&
    checkK.value !== null &&
    (!pointsEqual(result.trace.p, checkP.point) || result.trace.k !== checkK.value);

  const kError =
    checkK.status === 'error' || (checkK.status === 'empty' && attempted) ? checkK.message : null;

  return (
    <div className="space-y-4">
      <CardHeader
        title="Multiply a point by a scalar"
        description="kP = P + P + … + P (k times), computed with the double-and-add method."
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2" data-tour="multiply-k">
          <PointInput
            which="P"
            idPrefix="mul"
            draft={state.pointP}
            check={checkP}
            onChange={(change) => setPoint('P', change)}
            showMissing={attempted}
          />
          <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-sunken font-mono text-note font-semibold text-ink-soft">
                k
              </span>
              <span className="text-sm font-semibold text-ink" aria-hidden="true">
                Scalar k
              </span>
            </div>
            <TextField
              id="mul-k"
              label="k"
              className="mt-3"
              value={state.k}
              onChange={setScalar}
              placeholder="5"
              error={kError}
              hint="A whole number: 0, negative values and 0x hex are accepted, up to 1024 bits."
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" icon="play">
            Calculate kP
          </Button>
          <Button
            icon="target"
            disabled={!curve || checkP.point === undefined}
            title="Watch P, 2P, 3P, … until they return to O"
            onClick={() => setAnimating(true)}
          >
            Animate multiples of P
          </Button>
        </div>
      </form>

      {curve && checkP.point !== undefined && (
        <Dialog
          open={animating}
          onClose={() => setAnimating(false)}
          title="Multiples of P"
          description={`P = ${pointText(checkP.point, true)}: adding P again and again until the sum is O.`}
          widthClass="max-w-4xl"
          testId="multiples-dialog"
        >
          {/* Mounted only while open, so every opening starts again from 1P. */}
          {animating && <MultiplesAnimation curve={curve} point={checkP.point} />}
        </Dialog>
      )}

      {problem !== null && (
        <Callout
          tone="danger"
          title="Cannot calculate yet"
          role="alert"
          data-testid="multiply-problem"
        >
          {problem}
        </Callout>
      )}

      {result !== null && stale && (
        <Callout tone="warning" data-testid="multiply-stale">
          k or P has changed since this result was calculated. Press{' '}
          <strong className="font-semibold">Calculate kP</strong> to update it.
        </Callout>
      )}

      {result !== null && (
        // A new calculation starts with every row closed again.
        <MultiplyResult
          key={`${result.trace.k}:${pointText(result.trace.p)}`}
          curve={result.curve}
          trace={result.trace}
        />
      )}
    </div>
  );
}
