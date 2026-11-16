/**
 * Live password strength meter for choosing a new password. It runs the same rules as the
 * server (shared/passwordRules.ts), so what it accepts the server accepts too. The rules
 * include a large word list, so they are loaded only when a password form is opened.
 */
import { useEffect, useState } from 'react';
import { cx } from '../../lib/cx.ts';
import type * as PasswordRules from '@shared/passwordRules.ts';
import type { PasswordCheck } from '@shared/passwordRules.ts';

/** The rules module, loaded once on first use. */
let rules: Promise<typeof PasswordRules> | null = null;

/** Colour of the bar for each score from 0 to 4. */
const BAR_COLORS = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success'];

interface PasswordMeterProps {
  password: string;
  email: string;
  /** Called with the verdict whenever it changes, so the form can block a weak password. */
  onCheck?: (check: PasswordCheck | null) => void;
}

/** Shows the strength of a password as a bar, a label and one tip. */
export function PasswordMeter({ password, email, onCheck }: PasswordMeterProps) {
  const [check, setCheck] = useState<PasswordCheck | null>(null);

  useEffect(() => {
    let cancelled = false;
    rules ??= import('@shared/passwordRules.ts');
    void rules.then((module) => {
      if (cancelled) return;
      const next = password === '' ? null : module.checkPassword(password, email);
      setCheck(next);
      onCheck?.(next);
    });
    return () => {
      cancelled = true;
    };
  }, [password, email, onCheck]);

  if (check === null) {
    return (
      <p className="text-note text-muted" data-testid="password-meter">
        At least 12 characters. A few unrelated words make a strong password that is easy to
        remember.
      </p>
    );
  }

  return (
    <div data-testid="password-meter" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={cx(
              'h-1.5 flex-1 rounded-full',
              segment < Math.max(1, check.score) ? BAR_COLORS[check.score] : 'bg-sunken',
            )}
          />
        ))}
      </div>
      <p className="mt-1 text-note">
        <span className={cx('font-medium', check.problem ? 'text-danger' : 'text-success')}>
          {check.problem ? 'Not accepted' : check.label}
        </span>
        <span className="text-ink-soft"> · {check.problem ?? check.tip ?? 'Good choice.'}</span>
      </p>
    </div>
  );
}
