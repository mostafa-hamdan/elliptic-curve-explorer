/**
 * The Security center: change the password, turn two-factor authentication on or off,
 * make new recovery codes, see and end signed-in sessions, read recent security events,
 * and delete the account with all of its data.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { PasswordCheck } from '@shared/passwordRules.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { Card, CardHeader } from '../../components/ui/Card.tsx';
import { InputField } from '../../components/ui/InputField.tsx';
import { api, errorMessage } from '../../lib/api.ts';
import { count } from '../../lib/format.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { PasswordMeter } from '../auth/PasswordMeter.tsx';
import { RecoveryCodes } from '../auth/RecoveryCodes.tsx';

/** "16 Nov 2026, 14:05" in the user's own time zone. */
function when(time: number): string {
  return new Date(time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Fired after every security change, so the activity and session lists reload. */
const SECURITY_CHANGED = 'oncurve:security-changed';

/** Tell the other sections that something changed. */
function announceChange(): void {
  window.dispatchEvent(new Event(SECURITY_CHANGED));
}

/**
 * Run a loader now and again after every security change.
 *
 * @param load - the function that fetches a list.
 */
function useReloadOnChange(load: () => void): void {
  useEffect(() => {
    load();
    window.addEventListener(SECURITY_CHANGED, load);
    return () => window.removeEventListener(SECURITY_CHANGED, load);
  }, [load]);
}

/**
 * The second-factor box shown for sensitive actions when 2FA is on.
 *
 * @param value - what was typed.
 * @param onChange - called with the new text.
 */
function SecondFactorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <InputField
      label="Code from your app, or a recovery code"
      autoComplete="one-time-code"
      value={value}
      onChange={onChange}
      maxLength={20}
      hint="Two-factor authentication is on, so this change needs a code as well."
    />
  );
}

/**
 * A hidden copy of the account's email, so password managers know which saved password a
 * change-password form belongs to.
 */
function UsernameForManagers({ email }: { email: string }) {
  return (
    <input
      type="email"
      name="username"
      autoComplete="username"
      value={email}
      readOnly
      hidden
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}

/** A message under a form: green for success, red for an error. */
type Notice = { tone: 'success' | 'danger'; text: string } | null;

/** Show a form notice, if there is one. */
function NoticeLine({ notice, testId }: { notice: Notice; testId?: string }) {
  if (!notice) return null;
  return (
    <Callout
      tone={notice.tone}
      role={notice.tone === 'danger' ? 'alert' : 'status'}
      data-testid={testId}
    >
      {notice.text}
    </Callout>
  );
}

/** A section of the Security center. */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card as="section" aria-labelledby={id} className="p-5">
      <CardHeader id={id} title={title} description={description} level={2} />
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/** Change the password. */
function PasswordSection() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<PasswordCheck | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const handleCheck = useCallback((value: PasswordCheck | null) => setCheck(value), []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (current === '' || next === '')
      return setNotice({ tone: 'danger', text: 'Fill in both passwords.' });
    if (check?.problem) return setNotice({ tone: 'danger', text: check.problem });
    try {
      await api('POST', '/api/auth/password', {
        currentPassword: current,
        newPassword: next,
        ...(user?.twoFactor && code.trim() ? { code: code.trim() } : {}),
      });
      setCurrent('');
      setNext('');
      setCode('');
      announceChange();
      setNotice({
        tone: 'success',
        text: 'Password changed. Other browsers signed in to this account were signed out.',
      });
    } catch (caught) {
      setNotice({ tone: 'danger', text: errorMessage(caught) });
    }
  }

  return (
    <Section
      id="password-heading"
      title="Password"
      description="Changing it signs out every other browser."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-3" data-testid="password-form">
        <UsernameForManagers email={user?.email ?? ''} />
        <InputField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          maxLength={256}
        />
        <div className="space-y-1.5">
          <InputField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={setNext}
            maxLength={128}
          />
          <PasswordMeter password={next} email={user?.email ?? ''} onCheck={handleCheck} />
        </div>
        {user?.twoFactor && <SecondFactorField value={code} onChange={setCode} />}
        <NoticeLine notice={notice} testId="password-notice" />
        <Button type="submit" variant="primary">
          Change password
        </Button>
      </form>
    </Section>
  );
}

/** Turn two-factor authentication on (with a QR code) or off. */
function TwoFactorSection() {
  const { user, refresh } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const on = user?.twoFactor ?? false;

  async function begin() {
    try {
      setSetup(await api<{ secret: string; qrSvg: string }>('POST', '/api/auth/2fa/setup'));
      setNotice(null);
    } catch (caught) {
      setNotice({ tone: 'danger', text: errorMessage(caught) });
    }
  }

  async function enable(event: FormEvent) {
    event.preventDefault();
    try {
      await api('POST', '/api/auth/2fa/enable', { code: code.trim() });
      setSetup(null);
      setCode('');
      await refresh();
      announceChange();
      setNotice({
        tone: 'success',
        text: 'Two-factor authentication is on. Signing in now needs a code from your app.',
      });
    } catch (caught) {
      setNotice({ tone: 'danger', text: errorMessage(caught) });
    }
  }

  async function disable(event: FormEvent) {
    event.preventDefault();
    try {
      await api('POST', '/api/auth/2fa/disable', {
        password,
        ...(code.trim() ? { code: code.trim() } : {}),
      });
      setPassword('');
      setCode('');
      await refresh();
      announceChange();
      setNotice({ tone: 'success', text: 'Two-factor authentication is off.' });
    } catch (caught) {
      setNotice({ tone: 'danger', text: errorMessage(caught) });
    }
  }

  return (
    <Section
      id="twofactor-heading"
      title="Two-factor authentication"
      description={
        on
          ? 'On: signing in needs your password and a code from your app.'
          : 'Off: signing in needs only your password.'
      }
    >
      <div className="space-y-3" data-testid="twofactor">
        {!on && !setup && (
          <Button variant="primary" icon="shield" onClick={() => void begin()}>
            Turn on two-factor authentication
          </Button>
        )}
        {!on && setup && (
          <form onSubmit={enable} noValidate className="space-y-3">
            <p className="text-sm text-ink-soft">
              1. Scan this code with an authenticator app (for example Google Authenticator,
              Microsoft Authenticator or a password manager).
            </p>
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`}
              alt="QR code to add OnCurve to an authenticator app"
              width={176}
              height={176}
              className="rounded-lg border border-line bg-white p-2"
              data-testid="totp-qr"
            />
            <p className="text-note text-muted">
              Cannot scan? Type this key into the app:{' '}
              <code className="font-mono wrap-anywhere text-ink" data-testid="totp-secret">
                {setup.secret}
              </code>
            </p>
            <InputField
              label="2. Type the 6-digit code the app shows"
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              onChange={setCode}
              maxLength={8}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                Confirm and turn on
              </Button>
              <Button variant="ghost" onClick={() => setSetup(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {on && (
          <form onSubmit={disable} noValidate className="space-y-3">
            <InputField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              maxLength={256}
            />
            <InputField
              label="Code from your app, or a recovery code"
              autoComplete="one-time-code"
              value={code}
              onChange={setCode}
              maxLength={20}
            />
            <Button type="submit" variant="danger">
              Turn off two-factor authentication
            </Button>
          </form>
        )}
        <NoticeLine notice={notice} testId="twofactor-notice" />
      </div>
    </Section>
  );
}

/** See how many recovery codes are left and make new ones. */
function RecoverySection() {
  const { user, recoveryCodesLeft, refresh } = useAuth();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function regenerate(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api<{ recoveryCodes: string[] }>('POST', '/api/auth/recovery-codes', {
        password,
        ...(user?.twoFactor && code.trim() ? { code: code.trim() } : {}),
      });
      setCodes(result.recoveryCodes);
      setPassword('');
      setCode('');
      setNotice(null);
      await refresh();
      announceChange();
    } catch (caught) {
      setNotice({ tone: 'danger', text: errorMessage(caught) });
    }
  }

  return (
    <Section
      id="recovery-heading"
      title="Recovery codes"
      description={
        recoveryCodesLeft === null
          ? 'Codes for a lost password or authenticator.'
          : `${count(recoveryCodesLeft, 'unused code')} left. New codes replace all the old ones.`
      }
    >
      {codes ? (
        <div className="space-y-3">
          <RecoveryCodes codes={codes} email={user?.email ?? ''} />
          <Button variant="ghost" onClick={() => setCodes(null)}>
            I have saved them
          </Button>
        </div>
      ) : (
        <form onSubmit={regenerate} noValidate className="space-y-3">
          {recoveryCodesLeft !== null && recoveryCodesLeft <= 2 && (
            <Callout tone="warning">
              You are running out of recovery codes. Make new ones now.
            </Callout>
          )}
          <InputField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            maxLength={256}
          />
          {user?.twoFactor && <SecondFactorField value={code} onChange={setCode} />}
          <NoticeLine notice={notice} testId="recovery-notice" />
          <Button type="submit">Create new recovery codes</Button>
        </form>
      )}
    </Section>
  );
}

interface SessionRow {
  id: string;
  device: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

/** Signed-in browsers, with a button to end each one, and every one at once. */
function SessionsSection() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ sessions: SessionRow[] }>('GET', '/api/account/sessions')).sessions);
    } catch (caught) {
      setNotice({ tone: 'danger', text: errorMessage(caught) });
    }
  }, []);

  useReloadOnChange(load);

  async function end(row: SessionRow) {
    try {
      await api('DELETE', `/api/account/sessions/${row.id}`);
      if (row.current) {
        await refresh();
        navigate('/signin');
      } else {
        announceChange();
      }
    } catch (caught) {
      setNotice({ tone: 'danger', text: errorMessage(caught) });
    }
  }

  async function endAll() {
    try {
      await api('POST', '/api/auth/signout-all');
      await refresh();
      navigate('/signin');
    } catch (caught) {
      setNotice({ tone: 'danger', text: errorMessage(caught) });
    }
  }

  return (
    <Section
      id="sessions-heading"
      title="Signed-in browsers"
      description="A browser stays signed in for up to 7 days, and is signed out after 2 hours without use."
    >
      <ul className="space-y-2" data-testid="sessions-list">
        {rows?.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {row.device}
                {row.current && (
                  <span className="ml-2 rounded-md bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success">
                    This browser
                  </span>
                )}
              </p>
              <p className="text-note text-muted">
                Signed in {when(row.createdAt)} · last active {when(row.lastSeenAt)}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon="logout"
              aria-label={`Sign out ${row.device}${row.current ? ' (this browser)' : ''}`}
              onClick={() => void end(row)}
            >
              Sign out
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Button variant="danger" icon="logout" onClick={() => void endAll()}>
          Sign out of all devices
        </Button>
      </div>
      <div className="mt-3">
        <NoticeLine notice={notice} />
      </div>
    </Section>
  );
}

/** Recent sign-ins and security changes. */
function ActivitySection() {
  const [rows, setRows] = useState<Array<{ event: string; device: string; at: number }> | null>(
    null,
  );

  const load = useCallback(() => {
    api<{ activity: Array<{ event: string; device: string; at: number }> }>(
      'GET',
      '/api/account/activity',
    )
      .then((result) => setRows(result.activity))
      .catch(() => setRows([]));
  }, []);
  useReloadOnChange(load);

  return (
    <Section
      id="activity-heading"
      title="Recent activity"
      description="Sign-ins and security changes on this account, newest first."
    >
      <ol className="divide-y divide-line" data-testid="activity-list">
        {rows?.map((row, index) => (
          <li key={index} className="flex flex-wrap justify-between gap-x-4 py-2 text-sm">
            <span className="font-medium text-ink">{row.event}</span>
            <span className="text-note text-muted">
              {row.device} · {when(row.at)}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Delete the account and everything in it. */
function DeleteSection() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sure, setSure] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!sure)
      return setNotice({
        tone: 'danger',
        text: 'Tick the box to confirm that you want to delete everything.',
      });
    try {
      await api(
        'POST',
        '/api/account/delete',
        user?.twoFactor && code.trim() ? { password, code: code.trim() } : { password },
      );
      // Leave the account page first; once the user is gone it would send us to sign-in.
      navigate('/', { replace: true });
      await refresh();
    } catch (caught) {
      setNotice({ tone: 'danger', text: errorMessage(caught) });
    }
  }

  return (
    <Section
      id="delete-heading"
      title="Delete my account"
      description="Removes the account, saved items, history, settings and activity. This cannot be undone."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-3" data-testid="delete-form">
        <InputField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          maxLength={256}
        />
        {user?.twoFactor && (
          <InputField
            label="Code from your app, or a recovery code"
            autoComplete="one-time-code"
            value={code}
            onChange={setCode}
            maxLength={20}
          />
        )}
        <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={sure}
            onChange={(event) => setSure(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-danger"
          />
          I understand that everything in this account will be deleted for good.
        </label>
        <NoticeLine notice={notice} testId="delete-notice" />
        <Button type="submit" variant="danger" icon="trash">
          Delete my account
        </Button>
      </form>
    </Section>
  );
}

/** The whole Security center. */
export function SecurityCenter() {
  const { user } = useAuth();
  if (user?.sharedDemo) {
    // Every visitor shares the hosted demo account, so its security cannot be changed.
    return (
      <div className="space-y-5" data-testid="security-center">
        <Callout tone="info" title="This is the shared demo account" data-testid="demo-locked">
          Every visitor uses it, so its password, two-factor authentication and recovery codes
          cannot be changed, and it cannot be deleted. Create your own free account to try those
          features.
        </Callout>
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <SessionsSection />
          <ActivitySection />
        </div>
      </div>
    );
  }
  return (
    <div className="grid items-start gap-5 xl:grid-cols-2" data-testid="security-center">
      <div className="space-y-5">
        <PasswordSection />
        <TwoFactorSection />
        <RecoverySection />
      </div>
      <div className="space-y-5">
        <SessionsSection />
        <ActivitySection />
        <DeleteSection />
      </div>
    </div>
  );
}
