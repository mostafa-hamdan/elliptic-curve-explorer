/**
 * Small "copy to clipboard" button placed next to results, so a long number can be
 * pasted elsewhere without selecting it by hand.
 */
import { useEffect, useRef, useState } from 'react';
import { cx } from '../../lib/cx.ts';
import { Icon } from './Icon.tsx';

interface CopyButtonProps {
  /** The text that is copied. */
  text: string;
  /** What is being copied, for the accessible name: "Copy result". */
  label: string;
  className?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Copy `text` to the clipboard and confirm with a tick for a moment.
 * The clipboard can be unavailable (an old browser, or a page not served from localhost
 * or https). In that case the button says so instead of failing silently.
 */
export function CopyButton({ text, label, className }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);

  // Stop the "back to idle" timer if the button disappears first.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleClick() {
    let next: CopyState = 'copied';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      next = 'failed';
    }
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1800);
  }

  const caption = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={state === 'idle' ? label : caption}
      title={label}
      className={cx(
        'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-line px-2 text-xs font-medium transition-colors',
        state === 'copied' && 'border-success/40 bg-success-soft text-success',
        state === 'failed' && 'border-danger/40 bg-danger-soft text-danger',
        state === 'idle' && 'bg-surface text-ink-soft hover:bg-sunken hover:text-ink',
        className,
      )}
    >
      <Icon name={state === 'copied' ? 'check' : state === 'failed' ? 'alert' : 'copy'} size={13} />
      {/* Announced politely so screen-reader users also learn that the copy worked. */}
      <span aria-live="polite">{caption}</span>
    </button>
  );
}
