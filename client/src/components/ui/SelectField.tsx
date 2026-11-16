/**
 * Labelled drop-down list, styled to match the text inputs.
 * It wraps the browser's own <select>, which is fully keyboard and screen-reader
 * accessible on every platform.
 */
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Icon } from './Icon.tsx';

interface SelectFieldProps {
  /** Unique id connecting the label to the list. */
  id: string;
  /** Visible label. */
  label: ReactNode;
  /** Currently selected option value. */
  value: string;
  /** Called with the newly selected value. */
  onChange: (value: string) => void;
  /** The <option> and <optgroup> elements. */
  children: ReactNode;
  disabled?: boolean;
  /** Hide the label visually (it is still read by screen readers). */
  hideLabel?: boolean;
  className?: string;
}

/** A drop-down list with a label above it. */
export function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  disabled,
  hideLabel,
  className,
}: SelectFieldProps) {
  return (
    <div className={cx('min-w-0', className)}>
      <label
        htmlFor={id}
        className={cx('mb-1 block text-note font-medium text-ink-soft', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cx(
            'h-10 w-full cursor-pointer appearance-none rounded-lg border border-line-strong bg-surface pr-9 pl-3 text-sm text-ink transition-colors',
            'hover:border-muted disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted',
          )}
        >
          {children}
        </select>
        <Icon
          name="chevronDown"
          size={16}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
        />
      </div>
    </div>
  );
}
