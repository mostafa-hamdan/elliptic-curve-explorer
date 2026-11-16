/**
 * "My work": the curves and points the user saved, and the history of calculations, each
 * with one click to load it back into the Explorer.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { Card, CardHeader } from '../../components/ui/Card.tsx';
import { api, errorMessage } from '../../lib/api.ts';
import { cx } from '../../lib/cx.ts';
import { count, shortNumber } from '../../lib/format.ts';
import { useExplorer } from '../explorer/ExplorerContext.tsx';
import { loadHistory, loadSaved, type HistoryInput, type SavedData } from './loadIntoExplorer.ts';

interface SavedItem {
  id: number;
  kind: 'curve' | 'point';
  name: string;
  data: SavedData;
  createdAt: number;
}

interface HistoryItem {
  id: number;
  operation: 'points' | 'add' | 'multiply';
  input: HistoryInput;
  result: string;
  createdAt: number;
}

/** "16 Nov, 14:05" in the user's own time zone. */
function when(time: number): string {
  return new Date(time).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Shorten a value that may be a 256-bit number written out in full. */
function brief(value: string | boolean | undefined): string {
  if (typeof value !== 'string') return '';
  return /^\d+$/.test(value)
    ? shortNumber(BigInt(value), 6)
    : value.length > 20
      ? `${value.slice(0, 10)}…`
      : value;
}

/** One line describing the inputs of a history entry. */
function describeInput(item: HistoryItem): string {
  const { input } = item;
  const curve = `E${brief(input.p)}(${brief(input.a)}, ${brief(input.b)})`;
  const P = input.pInfinity ? 'O' : `(${brief(input.px)}, ${brief(input.py)})`;
  const Q = input.qInfinity ? 'O' : `(${brief(input.qx)}, ${brief(input.qy)})`;
  if (item.operation === 'add') return `${curve}: ${P} + ${Q}`;
  if (item.operation === 'multiply') return `${curve}: ${brief(input.k)} · ${P}`;
  return `${curve}: all points`;
}

const OPERATION_LABELS = {
  points: 'All points',
  add: 'Addition',
  multiply: 'Multiplication',
} as const;

/** The My work tab of the account page. */
export function MyWork() {
  const explorer = useExplorer();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<SavedItem[] | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    try {
      const [savedResult, historyResult] = await Promise.all([
        api<{ items: SavedItem[] }>('GET', '/api/saved'),
        api<{ entries: HistoryItem[] }>('GET', '/api/history'),
      ]);
      setSaved(savedResult.items);
      setHistory(historyResult.entries);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: number) {
    try {
      await api('DELETE', `/api/saved/${id}`);
      setSaved((items) => items?.filter((item) => item.id !== id) ?? null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function clearHistory() {
    try {
      await api('DELETE', '/api/history');
      setHistory([]);
      setConfirmClear(false);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      {error && (
        <Callout tone="danger" role="alert" className="xl:col-span-2">
          {error}
        </Callout>
      )}

      <Card as="section" aria-labelledby="saved-heading" className="p-5">
        <CardHeader
          id="saved-heading"
          title="Saved curves and points"
          description={saved ? count(saved.length, 'item') : 'Loading…'}
        />
        <ul className="mt-4 space-y-2" data-testid="saved-list">
          {saved?.length === 0 && (
            <li className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">
              Nothing saved yet. Use{' '}
              <strong className="font-semibold text-ink-soft">Save curve</strong> on the Explorer
              page, or the save button next to a point.
            </li>
          )}
          {saved?.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3"
            >
              <span
                className={cx(
                  'rounded-md px-2 py-0.5 text-xs font-semibold',
                  item.kind === 'curve'
                    ? 'bg-primary-soft text-primary'
                    : 'bg-point-q-soft text-point-q',
                )}
              >
                {item.kind === 'curve' ? 'Curve' : 'Point'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words text-ink" title={item.name}>
                  {item.name}
                </p>
                <p className="font-mono text-note break-all text-muted">
                  E{brief(item.data.p)}({brief(item.data.a)}, {brief(item.data.b)})
                  {item.data.x !== undefined && ` · (${brief(item.data.x)}, ${brief(item.data.y)})`}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  loadSaved(explorer, item.data);
                  navigate('/');
                }}
              >
                Load
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                aria-label={`Delete ${item.name}`}
                onClick={() => void remove(item.id)}
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section" aria-labelledby="history-heading" className="p-5">
        <CardHeader
          id="history-heading"
          title="History"
          description={
            history ? `${count(history.length, 'calculation')}, newest first` : 'Loading…'
          }
          actions={
            history && history.length > 0 ? (
              confirmClear ? (
                <>
                  <Button size="sm" variant="danger" onClick={() => void clearHistory()}>
                    Yes, clear it
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  onClick={() => setConfirmClear(true)}
                >
                  Clear history
                </Button>
              )
            ) : undefined
          }
        />
        <ul className="mt-4 max-h-[520px] space-y-2 overflow-y-auto" data-testid="history-list">
          {history?.length === 0 && (
            <li className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">
              Every calculation you make while signed in appears here.
            </li>
          )}
          {history?.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">
                  {OPERATION_LABELS[item.operation]} · {when(item.createdAt)}
                </p>
                <p
                  className="font-mono text-note break-all text-ink-soft"
                  title={describeInput(item)}
                >
                  {describeInput(item)}
                </p>
                <p className="font-mono text-sm font-medium break-all text-ink" title={item.result}>
                  = {item.result}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  loadHistory(explorer, item.operation, item.input);
                  navigate('/');
                }}
              >
                Open
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
