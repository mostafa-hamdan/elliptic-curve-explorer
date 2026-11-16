/**
 * A labelled one-line input for words rather than curve numbers: email addresses,
 * passwords (with a Show button), codes and names. Same look and messages as TextField.
 */
import { useId, useState, type ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Icon } from './Icon.tsx';

interface InputFieldProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'password';
  /** Browser autofill hint, for example "email", "current-password", "one-time-code". */
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'email';
  placeholder?: string;
  hint?: ReactNode;
  error?: string | null;
  maxLength?: number;
  autoFocus?: boolean;
  className?: string;
  /** Hook for browser tests. */
  testId?: string;
}

/** The input. Password fields get a Show / Hide button. */
export function InputField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  inputMode,
  placeholder,
  hint,
  error,
  maxLength,
  autoFocus,
  className,
  testId,
}: InputFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  const hasMessage = Boolean(error) || Boolean(hint);

  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1 block text-note font-medium text-ink-soft">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && shown ? 'text' : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={placeholder}
          maxLength={maxLength}
          // The sign-in pages open with the cursor in the first box, which is expected there.
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={Boolean(error)}
          aria-describedby={hasMessage ? messageId : undefined}
          data-testid={testId}
          className={cx(
            'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-muted/70',
            isPassword && 'pr-16',
            error ? 'border-danger' : 'border-line-strong hover:border-muted',
          )}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShown((value) => !value)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hasMessage && (
        <p
          id={messageId}
          className={cx(
            'mt-1 flex items-start gap-1 text-note leading-snug',
            error ? 'text-danger' : 'text-muted',
          )}
        >
          {error && <Icon name="alert" size={14} className="mt-0.5" />}
          <span className="min-w-0">{error ?? hint}</span>
        </p>
      )}
    </div>
  );
}
