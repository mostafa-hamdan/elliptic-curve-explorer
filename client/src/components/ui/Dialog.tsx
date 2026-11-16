/**
 * Modal dialog built on the browser's own <dialog> element, which already keeps the
 * keyboard focus inside the dialog, closes on Escape and hides the page behind it from
 * screen readers. Used for the settings, the keyboard shortcuts and other pop-ups.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Icon } from './Icon.tsx';

interface DialogProps {
  /** Whether the dialog is shown. */
  open: boolean;
  /** Called when the user closes it (close button, Escape, or a click on the backdrop). */
  onClose: () => void;
  /** Heading of the dialog; also its accessible name. */
  title: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  children: ReactNode;
  /** Buttons at the bottom, right-aligned. */
  footer?: ReactNode;
  /** Width class; defaults to a medium dialog. */
  widthClass?: string;
  /** Hook for browser tests. */
  testId?: string;
}

/** A centred modal window with a title, a close button and optional footer buttons. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClass = 'max-w-lg',
  testId,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Open and close the native dialog to match the `open` prop.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-testid={testId}
      // Escape fires "cancel"; let React state decide, so the two never disagree.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dimmed backdrop lands on the <dialog> element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-pop',
        'backdrop:bg-scrim backdrop:backdrop-blur-[2px]',
        widthClass,
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
