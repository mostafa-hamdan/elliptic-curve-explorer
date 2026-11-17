/**
 * Labeled text input with a hint, a "this is fine" note and an error message.
 * Every number the user types goes through this component, so validation feedback
 * looks and reads the same everywhere and is announced to screen readers.
 */
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Icon } from './Icon.tsx';

interface TextFieldProps {
  /** Unique id; also used to connect the label and the messages to the input. */
  id: string;
  /** Visible label. */
  label: ReactNode;
  /** Current text. */
  value: string;
  /** Called with the new text on every keystroke. */
  onChange: (value: string) => void;
  /** Example text shown while the box is empty. */
  placeholder?: string;
  /** Neutral help text under the box. Hidden while an error is shown. */
  hint?: ReactNode;
  /** Positive note (for example the reduced value). Hidden while an error is shown. */
  note?: ReactNode;
  /** Error message; when set the box turns red. */
  error?: string | null;
  /** Disable the box, for example while "point at infinity" is ticked. */
  disabled?: boolean;
  /** Extra classes for the wrapper. */
  className?: string;
}

/**
 * A text box for a whole number.
 *
 * It is a one-line box that grows downwards and wraps when the number is long, so a
 * 256-bit value (78 digits) is always visible in full instead of scrolling out of
 * sight. It is not `type="number"` because such values, and hexadecimal, do not fit in
 * a number input. Pressing Enter submits the surrounding form, as in a normal input.
 */
export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  note,
  error,
  disabled,
  className,
}: TextFieldProps) {
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const hasError = Boolean(error);
  const messageId = `${id}-message`;
  const hasMessage = hasError || Boolean(note) || Boolean(hint);

  // Fit the height to the text: one line for short numbers, more lines for long ones.
  // Runs again when the box changes width, because the text then wraps differently.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      box.style.height = 'auto';
      // scrollHeight leaves out the 1px border at the top and bottom, so add them back.
      box.style.height = `${box.scrollHeight + 2}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [value]);

  /** Enter submits the form (if there is one) instead of starting a new line. */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1 block text-note font-medium text-ink-soft">
        {label}
      </label>
      <textarea
        ref={boxRef}
        id={id}
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={hasError}
        aria-describedby={hasMessage ? messageId : undefined}
        className={cx(
          'block min-h-10 w-full resize-none overflow-hidden rounded-lg border bg-surface px-3 py-[0.5625rem] font-mono text-sm leading-5 wrap-anywhere text-ink transition-colors',
          'placeholder:text-muted/70 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted',
          hasError
            ? 'border-danger focus-visible:outline-danger'
            : 'border-line-strong hover:border-muted',
        )}
      />
      {hasMessage && (
        <p
          id={messageId}
          className={cx(
            'mt-1 flex items-start gap-1 text-note leading-snug',
            hasError ? 'text-danger' : note ? 'text-success' : 'text-muted',
          )}
        >
          {hasError && <Icon name="alert" size={14} className="mt-0.5" />}
          <span className="min-w-0 break-words">{hasError ? error : (note ?? hint)}</span>
        </p>
      )}
    </div>
  );
}
