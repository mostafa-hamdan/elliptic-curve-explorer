/**
 * The one button component used across the app, so every button has the same height,
 * corner radius, focus ring and disabled look.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Icon, type IconName } from './Icon.tsx';

/** Visual weight: one `primary` per group, `secondary` for other actions, `ghost` for minor ones. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. Defaults to `secondary`. */
  variant?: ButtonVariant;
  /** `sm` for buttons inside tables and toolbars. Defaults to `md`. */
  size?: 'sm' | 'md';
  /** Optional icon shown before the label. */
  icon?: IconName;
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-ink hover:bg-primary-hover shadow-card',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
  ghost: 'text-ink-soft hover:bg-sunken hover:text-ink',
  danger: 'bg-surface text-danger border border-line-strong hover:bg-danger-soft',
};

const SIZE_CLASSES = {
  sm: 'h-8 px-2.5 text-note gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
} as const;

/**
 * A button. `type` defaults to "button" so a button inside a form never submits it by
 * accident; pass `type="submit"` for the form's main action.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center font-medium whitespace-nowrap transition-colors select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}
