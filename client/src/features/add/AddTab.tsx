/**
 * The "Add points" tab: enter P and Q (or pick them from the list), calculate P + Q or
 * 2P, and read the full hand-method working underneath the result.
 */
import { useMemo, useState, type FormEvent } from 'react';
import {
  addWithSteps,
  isEccError,
  negate,
  pointsEqual,
  type AdditionCase,
  type Point,
} from '@shared/ecc/index.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { CardHeader } from '../../components/ui/Card.tsx';
import { pointText } from '../../lib/format.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { useExplorer } from '../explorer/ExplorerContext.tsx';
import { PointInput } from '../explorer/PointInput.tsx';
import { ResultHeader } from '../explorer/ResultHeader.tsx';
import { checkPoint, pointProblem, type PointDraft } from '../explorer/validation.ts';
import { AdditionSteps } from './AdditionSteps.tsx';
import { additionCsv, fileStem } from '../export/csv.ts';
import { ResultActions } from '../export/ResultActions.tsx';

/** Plain-English name of each case of the addition law. */
const RULE_NAMES: Record<AdditionCase, string> = {
  'left-identity': 'Identity',
  'right-identity': 'Identity',
  inverses: 'Inverse points',
  'vertical-tangent': 'Vertical tangent',
  doubling: 'Tangent rule (doubling)',
  chord: 'Chord rule',
};

/** Turn a point into the text that goes in the input boxes. */
function draftOf(point: Point): PointDraft {
  if (point === null) return { x: '', y: '', infinity: true };
  return { x: point.x.toString(), y: point.y.toString(), infinity: false };
}

/** The whole "Add points" tab. */
export function AddTab() {
  const { state, curveCheck, setPoint, setAddResult } = useExplorer();
  const { recordHistory } = useAuth();
  const curve = curveCheck.curve;
  // Empty boxes only show "enter a value" after the user has tried to calculate.
  const [attempted, setAttempted] = useState(false);
  // A problem message belongs to the inputs it was raised for: as soon as anything is
  // edited it disappears, instead of lingering next to inputs that may now be fine.
  const inputsKey = JSON.stringify([state.p, state.a, state.b, state.pointP, state.pointQ]);
  const [raised, setRaised] = useState<{ key: string; message: string } | null>(null);
  const problem = raised !== null && raised.key === inputsKey ? raised.message : null;
  const setProblem = (message: string | null) =>
    setRaised(message === null ? null : { key: inputsKey, message });

  const checkP = useMemo(() => checkPoint(curve, state.pointP, 'P'), [curve, state.pointP]);
  const checkQ = useMemo(() => checkPoint(curve, state.pointQ, 'Q'), [curve, state.pointQ]);

  /**
   * Run the addition and store the result, or explain what is missing.
   *
   * @param doubling - true for the "Double P" button, which adds P to itself.
   */
  function calculate(doubling: boolean) {
    setAttempted(true);
    if (!curve) {
      setProblem('Set up a valid curve on the left first.');
      return;
    }
    const firstProblem = pointProblem(checkP, 'P') ?? (doubling ? null : pointProblem(checkQ, 'Q'));
    if (firstProblem !== null || checkP.point === undefined) {
      setProblem(firstProblem);
      return;
    }
    const second = doubling ? checkP.point : checkQ.point;
    if (second === undefined) return;

    try {
      const trace = addWithSteps(curve, checkP.point, second);
      // For a doubling, show Q = P in the boxes so the screen matches what was computed.
      if (doubling) setPoint('Q', draftOf(checkP.point));
      setAddResult({ curve, trace });
      // Signed-in users get the calculation in their history (guests: nothing is sent).
      const secondDraft = doubling ? state.pointP : state.pointQ;
      recordHistory({
        operation: 'add',
        input: {
          p: state.p.trim(),
          a: state.a.trim(),
          b: state.b.trim(),
          px: state.pointP.x.trim(),
          py: state.pointP.y.trim(),
          pInfinity: state.pointP.infinity,
          qx: secondDraft.x.trim(),
          qy: secondDraft.y.trim(),
          qInfinity: secondDraft.infinity,
        },
        result: pointText(trace.result),
      });
      setProblem(null);
    } catch (error) {
      if (!isEccError(error)) throw error;
      setProblem(error.message);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    calculate(false);
  }

  const result = state.addResult;
  const usableP = checkP.point !== undefined;
  // The result stays on screen while the inputs are edited; say so when they differ.
  const stale =
    result !== null &&
    checkP.point !== undefined &&
    checkQ.point !== undefined &&
    (!pointsEqual(result.trace.p, checkP.point) || !pointsEqual(result.trace.q, checkQ.point));
  const isDoubling =
    result !== null &&
    (result.trace.kind === 'doubling' || result.trace.kind === 'vertical-tangent');

  return (
    <div className="space-y-4">
      <CardHeader
        title="Add two points"
        description="P + Q on the curve. Choose the same point twice, or press Double P, to compute 2P."
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2" data-tour="add-points">
          <PointInput
            which="P"
            idPrefix="add"
            draft={state.pointP}
            check={checkP}
            onChange={(change) => setPoint('P', change)}
            showMissing={attempted}
          />
          <PointInput
            which="Q"
            idPrefix="add"
            draft={state.pointQ}
            check={checkQ}
            onChange={(change) => setPoint('Q', change)}
            showMissing={attempted}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2" data-tour="add-actions">
          <Button type="submit" variant="primary" icon="plus">
            Calculate P + Q
          </Button>
          <Button onClick={() => calculate(true)}>Double P (2P)</Button>
          <Button
            variant="ghost"
            icon="swap"
            onClick={() => {
              setPoint('P', state.pointQ);
              setPoint('Q', state.pointP);
            }}
          >
            Swap P and Q
          </Button>
          <Button
            variant="ghost"
            disabled={!curve || !usableP}
            title="Fill Q with the inverse of P, to see that P + (−P) = O"
            onClick={() => {
              if (curve && checkP.point !== undefined) {
                setPoint('Q', draftOf(negate(curve, checkP.point)));
              }
            }}
          >
            Set Q = −P
          </Button>
        </div>
      </form>

      {problem !== null && (
        <Callout tone="danger" title="Cannot calculate yet" role="alert" data-testid="add-problem">
          {problem}
        </Callout>
      )}

      {result !== null && (
        <section
          aria-label="Addition result"
          className="space-y-4"
          data-testid="add-result-section"
        >
          <ResultHeader
            expression={isDoubling ? '2P' : 'P + Q'}
            result={result.trace.result}
            rule={RULE_NAMES[result.trace.kind]}
            testId="add-result"
            detail={
              <span className="font-mono wrap-anywhere">
                P = {pointText(result.trace.p)}, Q = {pointText(result.trace.q)}
              </span>
            }
          />
          <ResultActions
            csvLabel="Download steps (CSV)"
            testId="add-export"
            makeCsv={() => ({
              text: additionCsv(result.curve, result.trace),
              filename: `oncurve-${fileStem(result.curve)}-addition.csv`,
            })}
          />
          {stale && (
            <Callout tone="warning" data-testid="add-stale">
              P or Q has changed since this result was calculated. Press{' '}
              <strong className="font-semibold">Calculate P + Q</strong> to update it.
            </Callout>
          )}
          <div className="rounded-xl border border-line p-4">
            <h3 className="mb-3 text-base font-semibold text-ink">Step-by-step working</h3>
            <AdditionSteps curve={result.curve} trace={result.trace} />
          </div>
        </section>
      )}
    </div>
  );
}
