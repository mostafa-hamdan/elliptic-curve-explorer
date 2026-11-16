/**
 * Lost password: set a new password with one of the account's recovery codes. This is the
 * only way to recover an account, because the app never sends email.
 */
import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { PasswordCheck } from '@shared/passwordRules.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { InputField } from '../../components/ui/InputField.tsx';
import { useAuth } from '../../features/auth/AuthContext.tsx';
import { PasswordMeter } from '../../features/auth/PasswordMeter.tsx';
import { errorMessage } from '../../lib/api.ts';
import { usePageTitle } from '../../lib/usePageTitle.ts';
import { AuthLayout } from './AuthLayout.tsx';

/** The recovery page. */
export function RecoverPage() {
  usePageTitle('Recover your account');
  const { recover } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [check, setCheck] = useState<PasswordCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const handleCheck = useCallback((next: PasswordCheck | null) => setCheck(next), []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    let problem: string | null = null;
    if (email.trim() === '' || code.trim() === '')
      problem = 'Enter your email and one of your recovery codes.';
    else if (password === '') problem = 'Choose a new password.';
    else if (check?.problem) problem = check.problem;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recover(email.trim(), code.trim(), password);
      navigate('/account', { state: { recovered: true } });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Recover your account"
      description="Use one of the recovery codes you saved when you created the account."
      footer={
        <p>
          Remembered it?{' '}
          <Link to="/signin" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4" data-testid="recover-form">
        <InputField
          label="Email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={setEmail}
          maxLength={254}
          autoFocus
        />
        <InputField
          label="Recovery code"
          value={code}
          onChange={setCode}
          maxLength={20}
          placeholder="ABCDE-FGHJK"
          hint="Each code works once. After this you will have one code fewer."
        />
        <div className="space-y-1.5">
          <InputField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            maxLength={128}
          />
          <PasswordMeter password={password} email={email.trim()} onCheck={handleCheck} />
        </div>
        {error && (
          <Callout tone="danger" role="alert" data-testid="recover-error">
            {error}
          </Callout>
        )}
        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          {busy ? 'Checking…' : 'Set the new password'}
        </Button>
        <p className="text-note text-muted">
          For your safety, every browser signed in to this account will be signed out.
        </p>
      </form>
    </AuthLayout>
  );
}
