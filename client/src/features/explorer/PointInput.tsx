/**
 * Input card for one point (P or Q): type x and y, tick "point at infinity", or pick a
 * point from the list of all points. Shows live whether the point is on the curve, with
 * both sides of the equation, so a wrong point is explained rather than just refused.
 */
import { Button } from '../../components/ui/Button.tsx';
import { SelectField } from '../../components/ui/SelectField.tsx';
import { TextField } from '../../components/ui/TextField.tsx';
import { cx } from '../../lib/cx.ts';
import { shortNumber } from '../../lib/format.ts';
import { Icon } from '../../components/ui/Icon.tsx';
import { useExplorer } from './ExplorerContext.tsx';
import type { FieldCheck, PointCheck, PointDraft } from './validation.ts';

/** Above this many points a drop-down list stops being usable; the table is better. */
const PICKER_LIMIT = 2000;

/** Colours for each point role, taken from the design tokens. */
const ROLE_STYLES = {
  P: { badge: 'bg-point-p-soft text-point-p', border: 'border-point-p/30' },
  Q: { badge: 'bg-point-q-soft text-point-q', border: 'border-point-q/30' },
} as const;

interface PointBadgeProps {
  /** Which point this is. */
  which: 'P' | 'Q';
  className?: string;
}

/** The small coloured letter that marks P (blue) or Q (amber) everywhere in the app. */
export function PointBadge({ which, className }: PointBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-note font-semibold',
        ROLE_STYLES[which].badge,
        className,
      )}
    >
      {which}
    </span>
  );
}

interface PointInputProps {
  /** Which point this card edits. */
  which: 'P' | 'Q';
  /** What is typed at the moment. */
  draft: PointDraft;
  /** Validation of the draft against the current curve. */
  check: PointCheck;
  /** Called with the part of the draft that changed. */
  onChange: (change: Partial<PointDraft>) => void;
  /** Show "enter a value" under empty boxes (set after the user pressed Calculate). */
  showMissing: boolean;
  /** Prefix that keeps element ids unique between the Add and Multiply tabs. */
  idPrefix: string;
}

/** Error to show under a coordinate box. Empty boxes only complain after a submit. */
function coordinateError(field: FieldCheck, showMissing: boolean): string | null {
  if (field.status === 'error') return field.message;
  if (field.status === 'empty' && showMissing) return field.message;
  return null;
}

/** The line under the boxes that says whether the point is on the curve, and why. */
function OnCurveLine({ check, draft }: { check: PointCheck; draft: PointDraft }) {
  if (draft.infinity) {
    return (
      <p className="flex items-start gap-1.5 text-note text-muted">
        <Icon name="info" size={14} className="mt-0.5" />O is the identity element: adding it
        changes nothing.
      </p>
    );
  }
  if (check.sides === null || check.onCurve === null) return null;

  const left = shortNumber(check.sides.left);
  const right = shortNumber(check.sides.right);
  if (check.onCurve) {
    return (
      <p className="flex items-start gap-1.5 text-note text-success">
        <Icon name="checkCircle" size={14} className="mt-0.5" />
        <span className="min-w-0 break-words">
          On the curve: y² ≡ <span className="font-mono">{left}</span> and x³ + ax + b ≡{' '}
          <span className="font-mono">{right}</span> (mod p).
          {check.wasReduced && check.point && (
            <>
              {' '}
              Reduced mod p to{' '}
              <span className="font-mono">
                ({shortNumber(check.point.x)}, {shortNumber(check.point.y)})
              </span>
              .
            </>
          )}
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-note text-danger">
      <Icon name="errorCircle" size={14} className="mt-0.5" />
      <span className="min-w-0 break-words">
        Not on the curve: y² ≡ <span className="font-mono">{left}</span> but x³ + ax + b ≡{' '}
        <span className="font-mono">{right}</span> (mod p).
      </span>
    </p>
  );
}

/** The card for entering one point. */
export function PointInput({
  which,
  draft,
  check,
  onChange,
  showMissing,
  idPrefix,
}: PointInputProps) {
  const { curveCheck, listing } = useExplorer();
  const id = `${idPrefix}-${which.toLowerCase()}`;
  const list = listing.state.status === 'done' ? listing.state.list : null;
  const pickable = list !== null && list.count <= PICKER_LIMIT;

  // Which list entry matches the typed point, so the drop-down shows it as selected.
  let pickedValue = '';
  if (pickable && check.point !== undefined) {
    if (check.point === null) {
      pickedValue = 'O';
    } else {
      const x = Number(check.point.x);
      const y = Number(check.point.y);
      for (let index = 0; index < list.count; index += 1) {
        if (list.xs[index] === x && list.ys[index] === y) {
          pickedValue = String(index);
          break;
        }
      }
    }
  }

  /** Fill the boxes from the drop-down choice. */
  function handlePick(value: string) {
    if (list === null || value === '') return;
    if (value === 'O') {
      onChange({ infinity: true });
      return;
    }
    const index = Number(value);
    onChange({ x: String(list.xs[index]), y: String(list.ys[index]), infinity: false });
  }

  return (
    <fieldset
      className={cx('min-w-0 rounded-xl border bg-surface p-4', ROLE_STYLES[which].border)}
      data-testid={`${id}-card`}
    >
      <legend className="sr-only">Point {which}</legend>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PointBadge which={which} />
          <span className="text-sm font-semibold text-ink" aria-hidden="true">
            Point {which}
          </span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-note text-ink-soft">
          <input
            type="checkbox"
            checked={draft.infinity}
            onChange={(event) => onChange({ infinity: event.target.checked })}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
          Point at infinity (O)
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <TextField
          id={`${id}-x`}
          label={`x of ${which}`}
          value={draft.infinity ? '' : draft.x}
          onChange={(x) => onChange({ x })}
          placeholder={draft.infinity ? '—' : 'x'}
          disabled={draft.infinity}
          error={draft.infinity ? null : coordinateError(check.x, showMissing)}
        />
        <TextField
          id={`${id}-y`}
          label={`y of ${which}`}
          value={draft.infinity ? '' : draft.y}
          onChange={(y) => onChange({ y })}
          placeholder={draft.infinity ? '—' : 'y'}
          disabled={draft.infinity}
          error={draft.infinity ? null : coordinateError(check.y, showMissing)}
        />
      </div>

      <div className="mt-2 min-h-5" data-testid={`${id}-status`}>
        <OnCurveLine check={check} draft={draft} />
      </div>

      {/* Choosing from the list: only offered when the curve is small enough to list. */}
      {curveCheck.curve && listing.canList && (
        <div className="mt-3 border-t border-line pt-3">
          {pickable && (
            <SelectField
              id={`${id}-pick`}
              label={`Or pick ${which} from the list of points`}
              value={pickedValue}
              onChange={handlePick}
            >
              <option value="">Choose a point…</option>
              <option value="O">O (point at infinity)</option>
              {Array.from({ length: list.count }, (_, index) => (
                <option key={index} value={index}>
                  ({list.xs[index]}, {list.ys[index]})
                </option>
              ))}
            </SelectField>
          )}
          {list !== null && !pickable && (
            <p className="text-note text-muted">
              This curve has too many points for a menu. Use the table in the All points tab to
              choose {which}.
            </p>
          )}
          {listing.state.status === 'idle' && (
            <Button variant="ghost" size="sm" icon="list" onClick={listing.start}>
              Load the points to pick from a list
            </Button>
          )}
          {listing.state.status === 'running' && (
            <p className="text-note text-muted">
              Finding the points… {Math.round(listing.state.progress * 100)}%
            </p>
          )}
          {listing.state.status === 'error' && (
            <p className="text-note text-danger">{listing.state.message}</p>
          )}
        </div>
      )}
    </fieldset>
  );
}
