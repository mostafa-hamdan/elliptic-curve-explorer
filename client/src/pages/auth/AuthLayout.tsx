/**
 * The shared frame of the sign-in, sign-up and recovery pages: a centred card with a
 * title, plus the notice shown when accounts are not available (no server reachable).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Callout } from '../../components/ui/Callout.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { useAuth } from '../../features/auth/AuthContext.tsx';

interface AuthLayoutProps {
  title: string;
  description: ReactNode;
  children: ReactNode;
  /** Links under the card, for example "Create an account". */
  footer?: ReactNode;
}

/** A centred card for an account form. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  const { status } = useAuth();
  return (
    <div className="mx-auto max-w-md py-4">
      <Card className="p-6 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
        <div className="mt-5">
          {status === 'unavailable' ? (
            <Callout
              tone="warning"
              title="Accounts are not available right now"
              data-testid="accounts-unavailable"
            >
              The OnCurve server cannot be reached, so signing in is not possible. Everything else
              works as a guest; nothing you calculate needs an account.
            </Callout>
          ) : (
            children
          )}
        </div>
      </Card>
      {footer && <div className="mt-4 space-y-1 text-center text-sm text-ink-soft">{footer}</div>}
      <p className="mt-6 text-center text-note text-muted">
        An account only adds saving: every calculation works without one.{' '}
        <Link to="/security" className="font-medium text-primary hover:underline">
          How your account is protected
        </Link>
      </p>
    </div>
  );
}
