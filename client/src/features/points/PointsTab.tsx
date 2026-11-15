/**
 * The "All points" tab: finds every point of the current curve in the background, then
 * shows the total, the Hasse bound check, a plot and a paged table from which a point
 * can be chosen as P or Q.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { hasseCheck, LIST_POINTS_MAX_P, type Point } from '@shared/ecc/index.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { CardHeader } from '../../components/ui/Card.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { Pager } from '../../components/ui/Pager.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { SelectField } from '../../components/ui/SelectField.tsx';
import { cx } from '../../lib/cx.ts';
import { grouped, plain } from '../../lib/format.ts';
import { useExplorer } from '../explorer/ExplorerContext.tsx';
import { PointBadge } from '../explorer/PointInput.tsx';
import { checkPoint } from '../explorer/validation.ts';
import { PointsPlot, type PlotHighlight } from './PointsPlot.tsx';
import type { PointList } from './usePointListing.ts';

/** Choices for how many rows the table shows at once. */
const PAGE_SIZES = [10, 25, 50, 100] as const;

interface StatProps {
  label: string;
  children: ReactNode;
  /** Small text under the value. */
  detail?: ReactNode;
  testId?: string;
}

/** One figure in the summary row above the plot. */
function Stat({ label, children, detail, testId }: StatProps) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-sunken px-3.5 py-2.5">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-semibold text-ink" data-testid={testId}>
        {children}
      </p>
      {detail && <p className="text-[13px] leading-snug text-muted">{detail}</p>}
    </div>
  );
}

interface PointsTableProps {
  list: PointList;
  /** The points currently chosen as P and Q, to mark their rows. */
  selectedP: Point | undefined;
  selectedQ: Point | undefined;
  /** Called when the user chooses a row as P or Q. `null` is the point at infinity. */
  onSelect: (which: 'P' | 'Q', point: Point) => void;
}

/** Does a table row (given by its coordinates, or null for O) equal a selected point? */
function isSelected(selected: Point | undefined, row: Point): boolean {
  if (selected === undefined) return false;
  if (selected === null || row === null) return selected === row;
  return selected.x === row.x && selected.y === row.y;
}

/** The paged table of points. Row 1 is always the point at infinity O. */
function PointsTable({ list, selectedP, selectedQ, onSelect }: PointsTableProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);

  const totalRows = list.count + 1; // every ordinary point, plus O
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const first = currentPage * pageSize;
  const last = Math.min(totalRows, first + pageSize);

  const rows: Array<{ number: number; point: Point }> = [];
  for (let row = first; row < last; row += 1) {
    rows.push({
      number: row + 1,
      point: row === 0 ? null : { x: BigInt(list.xs[row - 1]!), y: BigInt(list.ys[row - 1]!) },
    });
  }

  return (
    <div className="min-w-0">
      <div className="relative overflow-hidden rounded-lg border border-line">
        <table className="w-full border-collapse text-sm" data-testid="points-table">
          <caption className="sr-only">
            Points of the curve, {grouped(totalRows)} in total including the point at infinity
          </caption>
          <thead>
            <tr className="bg-sunken text-left text-xs font-medium tracking-wide text-muted uppercase">
              <th scope="col" className="w-16 px-3 py-2">
                #
              </th>
              <th scope="col" className="px-3 py-2">
                x
              </th>
              <th scope="col" className="px-3 py-2">
                y
              </th>
              <th scope="col" className="w-28 px-3 py-2 text-right">
                Use as
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ number, point }) => {
              const name = point === null ? 'O' : `(${point.x}, ${point.y})`;
              const isP = isSelected(selectedP, point);
              const isQ = isSelected(selectedQ, point);
              return (
                <tr key={number} className="border-t border-line hover:bg-sunken/60">
                  <td className="px-3 py-1.5 font-mono text-[13px] text-muted">
                    {grouped(number)}
                  </td>
                  {point === null ? (
                    <td colSpan={2} className="px-3 py-1.5">
                      <span className="font-mono font-semibold text-ink">O</span>
                      <span className="ml-2 text-[13px] text-muted">point at infinity</span>
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-1.5 font-mono text-ink">{point.x.toString()}</td>
                      <td className="px-3 py-1.5 font-mono text-ink">{point.y.toString()}</td>
                    </>
                  )}
                  <td className="px-3 py-1.5">
                    <div className="flex justify-end gap-1.5">
                      {(['P', 'Q'] as const).map((which) => {
                        const active = which === 'P' ? isP : isQ;
                        return (
                          <button
                            key={which}
                            type="button"
                            aria-label={`Use ${name} as ${which}`}
                            aria-pressed={active}
                            onClick={() => onSelect(which, point)}
                            className={cx(
                              'inline-flex h-7 w-8 cursor-pointer items-center justify-center rounded-md border font-mono text-[13px] font-semibold transition-colors',
                              active &&
                                which === 'P' &&
                                'border-point-p bg-point-p-soft text-point-p',
                              active &&
                                which === 'Q' &&
                                'border-point-q bg-point-q-soft text-point-q',
                              !active && 'border-line bg-surface text-ink-soft hover:bg-sunken',
                            )}
                          >
                            {which}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted" data-testid="points-range">
          Rows {grouped(first + 1)}–{grouped(last)} of {grouped(totalRows)}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SelectField
            id="points-page-size"
            label="Rows per page"
            hideLabel
            value={String(pageSize)}
            onChange={(value) => {
              setPageSize(Number(value));
              setPage(0);
            }}
            className="w-32"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </SelectField>
          <Pager page={currentPage} pageCount={pageCount} onChange={setPage} label="points" />
        </div>
      </div>
    </div>
  );
}

/** The whole "All points" tab. */
export function PointsTab() {
  const { state, curveCheck, listing, setPoint } = useExplorer();
  const curve = curveCheck.curve;

  const selectedP = useMemo(
    () => checkPoint(curve, state.pointP, 'P').point,
    [curve, state.pointP],
  );
  const selectedQ = useMemo(
    () => checkPoint(curve, state.pointQ, 'Q').point,
    [curve, state.pointQ],
  );
  const highlights = useMemo<PlotHighlight[]>(() => {
    const marks: PlotHighlight[] = [];
    if (selectedQ) marks.push({ label: 'Q', point: selectedQ, role: 'q' });
    if (selectedP) marks.push({ label: 'P', point: selectedP, role: 'p' });
    return marks;
  }, [selectedP, selectedQ]);

  /** Put a table row into the P or Q boxes used by the other tabs. */
  function handleSelect(which: 'P' | 'Q', point: Point) {
    if (point === null) setPoint(which, { infinity: true });
    else setPoint(which, { x: point.x.toString(), y: point.y.toString(), infinity: false });
  }

  const header = (
    <CardHeader
      title="All points on the curve"
      description="Every (x, y) that satisfies the equation, plus the point at infinity O."
      actions={
        curve &&
        listing.canList &&
        (listing.state.status === 'running' ? (
          <Button icon="stop" onClick={listing.cancel}>
            Cancel
          </Button>
        ) : (
          <Button variant="primary" icon="play" onClick={listing.start}>
            {listing.state.status === 'done' ? 'Find again' : 'Find all points'}
          </Button>
        ))
      }
    />
  );

  if (!curve) {
    return (
      <div className="space-y-4">
        {header}
        <Callout tone="info" title="No curve yet" data-testid="points-empty">
          Set up a valid curve on the left first. Its points will be listed here.
        </Callout>
      </div>
    );
  }

  if (!listing.canList) {
    return (
      <div className="space-y-4">
        {header}
        <Callout tone="warning" title="This curve is too large to list" data-testid="points-limit">
          Listing every point is limited to p ≤ {grouped(LIST_POINTS_MAX_P)}, which takes about a
          second. A curve over this p has roughly p points, far too many to compute or display.
          Adding points and multiplying by a scalar still work for this curve.
        </Callout>
      </div>
    );
  }

  const listState = listing.state;

  return (
    <div className="space-y-4">
      {header}

      {listState.status === 'idle' && (
        <Callout tone="info" title="Ready to search" data-testid="points-idle">
          Press <strong className="font-semibold">Find all points</strong>. For each x from 0 to p −
          1 the app computes x³ + ax + b, tests it with Euler’s criterion and, when it is a square,
          takes its square root mod p to get the two points (x, y) and (x, p − y).
        </Callout>
      )}

      {listState.status === 'running' && (
        <div className="rounded-lg border border-line bg-sunken p-4" data-testid="points-running">
          <p className="mb-2 text-sm text-ink-soft">Finding the points in the background…</p>
          <ProgressBar value={listState.progress} label="Finding all points" />
        </div>
      )}

      {listState.status === 'error' && (
        <Callout tone="danger" title="The search did not finish" role="alert">
          {listState.message}
        </Callout>
      )}

      {listState.status === 'done' && (
        <PointsResult
          list={listState.list}
          selectedP={selectedP}
          selectedQ={selectedQ}
          highlights={highlights}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}

interface PointsResultProps extends PointsTableProps {
  highlights: PlotHighlight[];
}

/** Summary figures, plot and table for a finished search. */
function PointsResult({ list, selectedP, selectedQ, highlights, onSelect }: PointsResultProps) {
  const total = BigInt(list.count + 1);
  const hasse = hasseCheck(list.curve.p, total);

  return (
    <div className="space-y-4" data-testid="points-result">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Points, N"
          testId="points-total"
          detail={`${grouped(list.count)} ordinary + O`}
        >
          {grouped(total)}
        </Stat>
        <Stat
          label="Hasse bound"
          testId="points-hasse"
          detail={
            <span
              className={cx(
                'inline-flex items-center gap-1',
                hasse.within ? 'text-success' : 'text-danger',
              )}
            >
              <Icon name={hasse.within ? 'checkCircle' : 'errorCircle'} size={13} />
              {hasse.within ? 'N is inside the bound' : 'N is outside the bound'}
            </span>
          }
        >
          {grouped(hasse.lower)} ≤ {grouped(total)} ≤ {grouped(hasse.upper)}
        </Stat>
        <Stat label="p + 1 − N" detail={`must be within ±${grouped(hasse.width)} (2√p)`}>
          {plain(hasse.trace)}
        </Stat>
        <Stat label="Found in" detail={`${grouped(list.curve.p)} values of x tested`}>
          {list.elapsedMs < 10 ? list.elapsedMs.toFixed(1) : Math.round(list.elapsedMs)} ms
        </Stat>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-soft">
        <span className="text-muted">Selected for the other tabs:</span>
        <span className="inline-flex items-center gap-1.5" data-testid="selected-p">
          <PointBadge which="P" />
          <span className="font-mono">{describeSelection(selectedP)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5" data-testid="selected-q">
          <PointBadge which="Q" />
          <span className="font-mono">{describeSelection(selectedQ)}</span>
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <PointsPlot list={list} highlights={highlights} />
        <PointsTable
          // A new list starts again from page 1.
          key={`${list.curve.p}:${list.curve.a}:${list.curve.b}:${list.elapsedMs}`}
          list={list}
          selectedP={selectedP}
          selectedQ={selectedQ}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

/** Text for the "selected" line: the point, O, or a dash when nothing valid is chosen. */
function describeSelection(point: Point | undefined): string {
  if (point === undefined) return '—';
  return point === null ? 'O' : `(${point.x}, ${point.y})`;
}
