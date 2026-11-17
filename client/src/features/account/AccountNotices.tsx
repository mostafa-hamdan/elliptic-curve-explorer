/**
 * The thin strip under the top bar for account messages: the guest banner ("not signed
 * in, your work is not saved") and the result of a save that was parked while a guest
 * signed in. Mounted once, by the page frame.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Callout } from '../../components/ui/Callout.tsx';
import { Icon } from '../../components/ui/Icon.tsx';
import { api, errorMessage } from '../../lib/api.ts';
import { cx } from '../../lib/cx.ts';
import { HOME_PATH } from '../../lib/paths.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { clearPendingSave, readPendingSave } from './pendingSave.ts';

/** Key in the tab's session storage, set when the guest banner is closed. */
export const GUEST_BANNER_KEY = 'oncurve.guestBannerHidden';

/** Pages where the guest banner would only repeat what the page already says. */
const NO_BANNER_PATHS = new Set([HOME_PATH, '/signin', '/signup', '/recover']);

/** Was the guest banner closed earlier in this tab? */
function bannerHidden(): boolean {
  try {
    return window.sessionStorage.getItem(GUEST_BANNER_KEY) === '1';
  } catch {
    return false;
  }
}

interface StripProps {
  tone: 'info' | 'success' | 'danger';
  children: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
  testId: string;
  role?: 'status' | 'alert';
}

/** One full-width message line with a close button. */
function Strip({ tone, children, onClose, closeLabel, testId, role }: StripProps) {
  return (
    <div
      role={role}
      data-testid={testId}
      className={cx(
        'border-b print:hidden',
        tone === 'info' && 'border-primary/20 bg-primary-soft',
        tone === 'success' && 'border-success/25 bg-success-soft',
        tone === 'danger' && 'border-danger/25 bg-danger-soft',
      )}
    >
      <div className="mx-auto flex w-full max-w-[1480px] items-center gap-3 px-4 py-2 text-sm text-ink sm:px-6">
        <Icon
          name={tone === 'success' ? 'checkCircle' : tone === 'danger' ? 'errorCircle' : 'info'}
          size={17}
          className={cx(
            'shrink-0',
            tone === 'info' && 'text-primary',
            tone === 'success' && 'text-success',
            tone === 'danger' && 'text-danger',
          )}
        />
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          title={closeLabel}
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-soft hover:bg-surface/70 hover:text-ink"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * On the sign-in and sign-up pages: a reminder that a save is waiting.
 *
 * @param action - the words for what the guest is about to do, such as "sign in".
 */
export function PendingSaveHint({ action }: { action: string }) {
  const [pending] = useState(readPendingSave);
  if (!pending) return null;
  return (
    <Callout tone="info" data-testid="pending-save-hint" className="mb-4">
      After you {action}, you will go back to where you were and “{pending.name}” will be saved.
    </Callout>
  );
}

/** The guest banner and the parked-save result, whichever applies. */
export function AccountNotices() {
  const { status, user } = useAuth();
  const location = useLocation();
  const [hidden, setHidden] = useState(bannerHidden);
  const [saveNotice, setSaveNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Finish a save that was parked before signing in, once back on the screen it came from.
  useEffect(() => {
    if (!user) return;
    const pending = readPendingSave();
    if (!pending || pending.returnTo !== location.pathname) return;
    // Forget it first, so it can never be saved twice (for example by a second render).
    clearPendingSave();
    api('POST', '/api/saved', { kind: pending.kind, name: pending.name, data: pending.data })
      .then(() =>
        setSaveNotice({
          ok: true,
          text: `Saved “${pending.name}” to My work in your account.`,
        }),
      )
      .catch((caught: unknown) =>
        setSaveNotice({
          ok: false,
          text: `The ${pending.kind} could not be saved: ${errorMessage(caught)}`,
        }),
      );
  }, [user, location.pathname]);

  // A save message belongs to the screen it was shown on.
  useEffect(() => {
    setSaveNotice((current) => (current ? null : current));
  }, [location.pathname]);

  if (saveNotice) {
    return (
      <Strip
        tone={saveNotice.ok ? 'success' : 'danger'}
        role={saveNotice.ok ? 'status' : 'alert'}
        onClose={() => setSaveNotice(null)}
        closeLabel="Close this message"
        testId="pending-save-notice"
      >
        {saveNotice.text}{' '}
        {saveNotice.ok && (
          <Link
            to="/account"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Open My work
          </Link>
        )}
      </Strip>
    );
  }

  if (status !== 'ready' || user || hidden || NO_BANNER_PATHS.has(location.pathname)) {
    return null;
  }
  return (
    <Strip
      tone="info"
      onClose={() => {
        setHidden(true);
        try {
          window.sessionStorage.setItem(GUEST_BANNER_KEY, '1');
        } catch {
          // Storage blocked: the banner stays closed until the page is reloaded.
        }
      }}
      closeLabel="Hide this message"
      testId="guest-banner"
    >
      <span className="font-medium">You are not signed in.</span> Everything works, but your curves
      and results are not saved.{' '}
      <Link to="/signin" className="font-medium text-primary underline-offset-2 hover:underline">
        Sign in to keep your work
      </Link>
    </Strip>
  );
}
