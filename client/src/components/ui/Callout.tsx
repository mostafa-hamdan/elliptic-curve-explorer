/**
 * Callout: a tinted box for messages that deserve attention, such as "this curve is
 * valid", "this point is not on the curve" or a stated limitation.
 */
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';
import { Icon, type IconName } from './Icon.tsx';

/** What kind of message this is; decides the color and the icon. */
export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

interface CalloutProps {
  tone: CalloutTone;
  /** Short bold first line. */
  title?: ReactNode;
  children?: ReactNode;
  /**
   * Set to "status" (polite) or "alert" (urgent) when the message appears as the result
   * of an action, so screen readers announce it.
   */
  role?: 'status' | 'alert';
  className?: string;
  /** Hook for browser tests. */
  'data-testid'?: string;
}

const TONES: Record<CalloutTone, { box: string; icon: IconName; iconColor: string }> = {
  info: { box: 'bg-primary-soft border-primary/25', icon: 'info', iconColor: 'text-primary' },
  success: {
    box: 'bg-success-soft border-success/25',
    icon: 'checkCircle',
    iconColor: 'text-success',
  },
  warning: { box: 'bg-warning-soft border-warning/25', icon: 'alert', iconColor: 'text-warning' },
  danger: {
    box: 'bg-danger-soft border-danger/25',
    icon: 'errorCircle',
    iconColor: 'text-danger',
  },
};

/** A tinted message box with an icon, an optional title and body text. */
export function Callout({ tone, title, children, role, className, ...rest }: CalloutProps) {
  const style = TONES[tone];
  return (
    <div
      role={role}
      className={cx('flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm', style.box, className)}
      data-testid={rest['data-testid']}
    >
      <Icon name={style.icon} size={18} className={cx('mt-0.5', style.iconColor)} />
      <div className="min-w-0 flex-1 text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx('text-ink-soft', title ? 'mt-0.5' : '')}>{children}</div>}
      </div>
    </div>
  );
}
