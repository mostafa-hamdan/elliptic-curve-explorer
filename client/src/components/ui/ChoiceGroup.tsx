/**
 * A row of mutually exclusive choices (for example Light / Dark), drawn as buttons but
 * built from real radio inputs, so the arrow keys and screen readers work as expected.
 */
import { useId, type ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

interface ChoiceGroupProps<Id extends string> {
  /** Visible name of the group. */
  legend: ReactNode;
  /** The choices, in order. */
  options: ReadonlyArray<{ id: Id; label: ReactNode }>;
  /** The selected choice. */
  value: Id;
  onChange: (id: Id) => void;
  /** Hook for browser tests. */
  testId?: string;
}

/** A segmented radio group. */
export function ChoiceGroup<Id extends string>({
  legend,
  options,
  value,
  onChange,
  testId,
}: ChoiceGroupProps<Id>) {
  const name = useId();
  return (
    <fieldset className="min-w-0" data-testid={testId}>
      <legend className="mb-1.5 text-note font-medium text-ink-soft">{legend}</legend>
      <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-sunken p-1">
        {options.map((option) => {
          const checked = option.id === value;
          return (
            <label
              key={option.id}
              className={cx(
                'relative flex h-9 min-w-20 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                checked ? 'bg-surface text-primary shadow-card' : 'text-ink-soft hover:text-ink',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={checked}
                onChange={() => onChange(option.id)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
