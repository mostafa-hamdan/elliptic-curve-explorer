/**
 * Pager: first / previous / next / last buttons with a "Page 2 of 7" label.
 * Used under the points table, which can hold up to 200,000 rows.
 */
import { cx } from '../../lib/cx.ts';
import { Icon, type IconName } from './Icon.tsx';

interface PagerProps {
  /** Current page, counted from 0. */
  page: number;
  /** Total number of pages (at least 1). */
  pageCount: number;
  /** Called with the new page number, already kept inside 0 … pageCount − 1. */
  onChange: (page: number) => void;
  /** What is being paged, for the accessible name: "points". */
  label: string;
}

/** Page navigation. Buttons that would do nothing are disabled rather than hidden. */
export function Pager({ page, pageCount, onChange, label }: PagerProps) {
  const last = Math.max(0, pageCount - 1);
  const go = (target: number) => onChange(Math.min(last, Math.max(0, target)));

  const buttons: Array<{ icon: IconName; name: string; target: number; disabled: boolean }> = [
    { icon: 'chevronsLeft', name: 'First page', target: 0, disabled: page <= 0 },
    { icon: 'chevronLeft', name: 'Previous page', target: page - 1, disabled: page <= 0 },
    { icon: 'chevronRight', name: 'Next page', target: page + 1, disabled: page >= last },
    { icon: 'chevronsRight', name: 'Last page', target: last, disabled: page >= last },
  ];

  const renderButton = (index: number) => {
    const button = buttons[index]!;
    return (
      <button
        key={button.name}
        type="button"
        aria-label={button.name}
        title={button.name}
        disabled={button.disabled}
        onClick={() => go(button.target)}
        className={cx(
          'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-ink-soft transition-colors',
          'hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        <Icon name={button.icon} size={16} />
      </button>
    );
  };

  return (
    <nav aria-label={`Pages of ${label}`} className="flex items-center gap-1.5">
      {renderButton(0)}
      {renderButton(1)}
      <span className="px-2 text-note text-ink-soft tabular-nums" aria-live="polite">
        Page{' '}
        <strong className="font-semibold text-ink">{(page + 1).toLocaleString('en-US')}</strong> of{' '}
        {pageCount.toLocaleString('en-US')}
      </span>
      {renderButton(2)}
      {renderButton(3)}
    </nav>
  );
}
