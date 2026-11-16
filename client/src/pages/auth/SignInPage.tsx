/**
 * Sign in: email and password, then (when two-factor authentication is on) the code from
 * the authenticator app or a recovery code.
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { InputField } from '../../components/ui/InputField.tsx';
import { useAuth } from '../../features/auth/AuthContext.tsx';
import { errorMessage } from '../../lib/api.ts';
import { usePageTitle } from '../../lib/usePageTitle.ts';
import { AuthLayout } from './AuthLayout.tsx';

/** The sign-in page. */
export function SignInPage() {
  usePageTitle('Sign in');
  const { signIn, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (email.trim() === '' || password === '') {
      setError('Enter your email and password.');
      return;
    }
    if (needsCode && code.trim() === '') {
      setError('Enter the 6-digit code from your authenticator app, or a recovery code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await signIn(email.trim(), password, needsCode ? code.trim() : undefined);
      if (outcome === 'second-factor') {
        setNeedsCode(true);
      } else {
        navigate('/account');
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return (
      <AuthLayout title="You are signed in" description={`Signed in as ${user.email}.`}>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => navigate('/account')}>
            Go to your account
          </Button>
          <Button onClick={() => void signOut()}>Sign out</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Sign in to save curves and points, keep a history and your progress."
      footer={
        <>
          <p>
            New here?{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
          <p>
            <Link to="/recover" className="font-medium text-primary hover:underline">
              Forgot your password?
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4" data-testid="signin-form">
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
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          maxLength={256}
        />
        {needsCode && (
          <InputField
            label="Code from your authenticator app"
            autoComplete="one-time-code"
            value={code}
            onChange={setCode}
            maxLength={20}
            autoFocus
            hint="The 6-digit code your app shows now. Lost your phone? Type one of your recovery codes instead."
            testId="signin-code"
          />
        )}
        {error && (
          <Callout tone="danger" role="alert" data-testid="signin-error">
            {error}
          </Callout>
        )}
        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          {busy ? 'Signing in…' : needsCode ? 'Check the code and sign in' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
