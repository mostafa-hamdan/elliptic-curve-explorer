/**
 * Create an account: email, password (with a live strength meter) and confirmation. After
 * the account is created, its ten recovery codes are shown once.
 */
import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { PasswordCheck } from '@shared/passwordRules.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { InputField } from '../../components/ui/InputField.tsx';
import { useAuth } from '../../features/auth/AuthContext.tsx';
import { PasswordMeter } from '../../features/auth/PasswordMeter.tsx';
import { RecoveryCodes } from '../../features/auth/RecoveryCodes.tsx';
import { errorMessage } from '../../lib/api.ts';
import { usePageTitle } from '../../lib/usePageTitle.ts';
import { AuthLayout } from './AuthLayout.tsx';

/** A loose check for an email shape; the server checks again. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The sign-up page. */
export function SignUpPage() {
  usePageTitle('Create an account');
  const { signUp, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [check, setCheck] = useState<PasswordCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const handleCheck = useCallback((next: PasswordCheck | null) => setCheck(next), []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    let problem: string | null = null;
    if (!EMAIL_SHAPE.test(trimmed))
      problem = 'Enter a valid email address, such as name@example.com.';
    else if (password === '') problem = 'Choose a password.';
    else if (check?.problem) problem = check.problem;
    else if (password !== confirm) problem = 'The two passwords are not the same.';
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setCodes(await signUp(trimmed, password));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <AuthLayout
        title="Your account is ready"
        description={`Signed in as ${user?.email ?? email.trim()}.`}
      >
        <div className="space-y-4">
          <RecoveryCodes codes={codes} email={email.trim()} />
          <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            I have saved my recovery codes somewhere safe.
          </label>
          <Button
            variant="primary"
            disabled={!saved}
            className="w-full"
            onClick={() => navigate('/account')}
          >
            Continue to my account
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create an account"
      description="Free, and only used to keep your work. The app never sends you email."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/signin" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4" data-testid="signup-form">
        <InputField
          label="Email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={setEmail}
          maxLength={254}
          autoFocus
          hint="Used only as your sign-in name."
        />
        <div className="space-y-1.5">
          <InputField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            maxLength={128}
          />
          <PasswordMeter password={password} email={email.trim()} onCheck={handleCheck} />
        </div>
        <InputField
          label="Type the password again"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          maxLength={128}
          error={
            confirm !== '' && confirm !== password ? 'The two passwords are not the same.' : null
          }
        />
        {error && (
          <Callout tone="danger" role="alert" data-testid="signup-error">
            {error}
          </Callout>
        )}
        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          {busy ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
