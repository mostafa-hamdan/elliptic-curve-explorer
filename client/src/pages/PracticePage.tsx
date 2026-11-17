/**
 * Practice mode: the app sets a small problem, the user works out each step by hand and
 * types the answers, and the app checks them and points to the first step that is wrong,
 * with a hint. Progress is kept in this browser.
 */
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/Button.tsx';
import { Callout } from '../components/ui/Callout.tsx';
import { Card } from '../components/ui/Card.tsx';
import { ChoiceGroup } from '../components/ui/ChoiceGroup.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { SelectField } from '../components/ui/SelectField.tsx';
import { cx } from '../lib/cx.ts';
import { EXPLORER_PATH } from '../lib/paths.ts';
import { count, equationText } from '../lib/format.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';
import { useExplorer } from '../features/explorer/ExplorerContext.tsx';
import {
  checkAnswers,
  createExercise,
  EXERCISE_KINDS,
  type CheckResult,
  type Difficulty,
  type Exercise,
  type ExerciseKind,
  type PracticeStep,
} from '../features/practice/exercises.ts';
import {
  readPracticeRecord,
  savePracticeRecord,
  type PracticeRecord,
} from '../features/practice/practiceRecord.ts';

interface StepRowProps {
  step: PracticeStep;
  index: number;
  value: string;
  onChange: (value: string) => void;
  status: CheckResult['statuses'][string] | undefined;
  /** True for the first step that is not correct after a check. */
  isFirstProblem: boolean;
  unreduced: boolean;
  revealed: boolean;
  onReveal: () => void;
}

/** One step: its label, the answer box, the verdict and, when needed, a hint. */
function StepRow({
  step,
  index,
  value,
  onChange,
  status,
  isFirstProblem,
  unreduced,
  revealed,
  onReveal,
}: StepRowProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const verdict =
    status === 'correct'
      ? { icon: 'checkCircle' as const, text: 'Correct', tone: 'text-success' }
      : status === 'wrong'
        ? { icon: 'errorCircle' as const, text: 'Not right', tone: 'text-danger' }
        : status === 'invalid'
          ? { icon: 'alert' as const, text: 'Not a whole number', tone: 'text-danger' }
          : status === 'empty'
            ? { icon: 'info' as const, text: 'No answer yet', tone: 'text-muted' }
            : null;

  return (
    <li
      className={cx(
        'rounded-xl border p-3.5 transition-colors',
        isFirstProblem ? 'border-danger/50 bg-danger-soft/40' : 'border-line',
      )}
      data-testid={`step-${step.id}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-xs font-semibold text-primary">
          {index + 1}
        </span>
        <label htmlFor={id} className="min-w-0 flex-1 text-sm font-medium text-ink">
          {step.label}
        </label>
        {step.type === 'number' ? (
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={status === 'wrong' || status === 'invalid'}
            aria-describedby={verdict ? messageId : undefined}
            className={cx(
              'h-10 w-28 rounded-lg border bg-surface px-3 font-mono text-sm text-ink',
              status === 'wrong' || status === 'invalid'
                ? 'border-danger'
                : status === 'correct'
                  ? 'border-success'
                  : 'border-line-strong',
            )}
          />
        ) : (
          <div className="w-40">
            <ChoiceGroup
              legend={<span className="sr-only">{step.label}</span>}
              options={[
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
              ]}
              value={(value === 'yes' || value === 'no' ? value : '') as 'yes' | 'no'}
              onChange={onChange}
            />
          </div>
        )}
        <span
          id={messageId}
          className={cx('flex w-36 items-center gap-1 text-note', verdict?.tone)}
        >
          {verdict && (
            <>
              <Icon name={verdict.icon} size={14} />
              {verdict.text}
            </>
          )}
        </span>
      </div>
      {status === 'correct' && unreduced && (
        <p className="mt-2 pl-9 text-note text-ink-soft">
          Right, and it is usual to write it reduced: {step.answer.toString()}.
        </p>
      )}
      {isFirstProblem && (
        <div className="mt-2 space-y-1.5 pl-9 text-sm" data-testid="practice-hint">
          <p className="text-ink">
            <strong className="font-semibold">Start here.</strong> {step.hint}
          </p>
          {revealed ? (
            <p className="font-mono text-note text-ink-soft" data-testid="practice-working">
              {step.working}
            </p>
          ) : (
            <Button size="sm" variant="ghost" onClick={onReveal}>
              Show how
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** The Practice page. */
export function PracticePage() {
  usePageTitle('Practice');
  const navigate = useNavigate();
  const explorer = useExplorer();
  const [kind, setKind] = useState<ExerciseKind>('add');
  const [difficulty, setDifficulty] = useState<Difficulty>('classroom');
  const [exercise, setExercise] = useState<Exercise>(() => createExercise('add', 'classroom'));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CheckResult | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [counted, setCounted] = useState({ attempted: false, solved: false });
  const [record, setRecord] = useState<PracticeRecord>(readPracticeRecord);

  /** Show the new record and keep it (in this browser, and in the account if signed in). */
  function updateRecord(next: PracticeRecord) {
    setRecord(next);
    savePracticeRecord(next);
  }

  /** Start a fresh exercise of the chosen kind and size. */
  function newExercise(nextKind = kind, nextDifficulty = difficulty) {
    setExercise(createExercise(nextKind, nextDifficulty));
    setAnswers({});
    setResult(null);
    setRevealed(new Set());
    setCounted({ attempted: false, solved: false });
  }

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    const outcome = checkAnswers(exercise, answers);
    setResult(outcome);
    // Each exercise counts once as attempted and at most once as solved.
    updateRecord({
      attempted: record.attempted + (counted.attempted ? 0 : 1),
      solved: record.solved + (outcome.allCorrect && !counted.solved ? 1 : 0),
    });
    setCounted({ attempted: true, solved: counted.solved || outcome.allCorrect });
  }

  /** Load the exercise into the Explorer, where the app shows its own full working. */
  function openInExplorer() {
    const target = exercise.explore;
    const curve = exercise.curve;
    if (!target || !curve) return;
    explorer.setCurveField('p', curve.p.toString());
    explorer.setCurveField('a', curve.a.toString());
    explorer.setCurveField('b', curve.b.toString());
    explorer.setPoint('P', { x: target.P.x.toString(), y: target.P.y.toString(), infinity: false });
    if (target.Q) {
      explorer.setPoint('Q', {
        x: target.Q.x.toString(),
        y: target.Q.y.toString(),
        infinity: false,
      });
    }
    if (target.k !== undefined) explorer.setScalar(target.k.toString());
    explorer.setTab(target.tab);
    navigate(EXPLORER_PATH);
  }

  const equation = exercise.curve ? equationText(exercise.curve) : null;
  const checkedOnce = result !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Practice</h1>
          <p className="mt-1 max-w-3xl text-muted">
            Solve a small problem by hand, step by step. Type each answer, press Check, and the app
            tells you which step to look at first.
          </p>
        </div>
        <p
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-soft"
          data-testid="practice-record"
        >
          <strong className="font-semibold text-ink">{record.solved}</strong> solved of{' '}
          {count(record.attempted, 'exercise')} tried
          {record.attempted > 0 && (
            <button
              type="button"
              className="ml-2 cursor-pointer text-note font-medium text-primary hover:underline"
              onClick={() => updateRecord({ attempted: 0, solved: 0 })}
            >
              Reset
            </button>
          )}
        </p>
      </div>

      <Card className="flex flex-wrap items-end gap-4 p-4">
        <SelectField
          id="practice-kind"
          label="Exercise"
          value={kind}
          onChange={(value) => {
            const next = value as ExerciseKind;
            setKind(next);
            newExercise(next, difficulty);
          }}
          className="w-56"
        >
          {EXERCISE_KINDS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <div className="w-64">
          <ChoiceGroup
            legend="Size of the numbers"
            options={[
              { id: 'classroom', label: 'p ≤ 23' },
              { id: 'harder', label: 'p ≤ 97' },
            ]}
            value={difficulty}
            onChange={(value) => {
              setDifficulty(value);
              newExercise(kind, value);
            }}
          />
        </div>
        <Button icon="reset" onClick={() => newExercise()} className="ml-auto">
          New exercise
        </Button>
      </Card>

      <Card as="section" aria-labelledby="exercise-prompt" className="p-5 sm:p-6">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          {EXERCISE_KINDS.find((option) => option.id === exercise.kind)?.label}
        </p>
        <h2
          id="exercise-prompt"
          className="mt-1 text-lg font-semibold text-ink"
          data-testid="practice-prompt"
        >
          {exercise.prompt}
        </h2>
        {equation && <p className="mt-1 font-mono text-sm text-ink-soft">{equation}</p>}

        <form onSubmit={handleCheck} noValidate className="mt-5">
          <ol className="space-y-2.5">
            {exercise.steps.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                index={index}
                value={answers[step.id] ?? ''}
                onChange={(value) => setAnswers((current) => ({ ...current, [step.id]: value }))}
                status={result?.statuses[step.id]}
                isFirstProblem={result !== null && result.firstProblem === index}
                unreduced={result?.unreduced.includes(step.id) ?? false}
                revealed={revealed.has(step.id)}
                onReveal={() => setRevealed((current) => new Set(current).add(step.id))}
              />
            ))}
          </ol>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" icon="check">
              Check my answers
            </Button>
            {exercise.explore && (
              <Button icon="target" onClick={openInExplorer}>
                Open in the Explorer
              </Button>
            )}
          </div>
        </form>

        {checkedOnce && result.allCorrect && (
          <Callout
            tone="success"
            title="Every step is correct"
            role="status"
            className="mt-4"
            data-testid="practice-success"
          >
            Well done. Try a new exercise, or a harder size.
            <div className="mt-2">
              <Button size="sm" variant="primary" onClick={() => newExercise()}>
                Next exercise
              </Button>
            </div>
          </Callout>
        )}
        {checkedOnce && !result.allCorrect && (
          <p className="mt-4 text-sm text-ink-soft" role="status" data-testid="practice-summary">
            {count(
              Object.values(result.statuses).filter((status) => status === 'correct').length,
              'step',
            )}{' '}
            of {exercise.steps.length} correct. Step {result.firstProblem + 1} is highlighted: fix
            it first, because the later steps build on it.
          </p>
        )}
      </Card>
    </div>
  );
}
