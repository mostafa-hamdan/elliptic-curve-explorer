/**
 * "Save" for a curve or a point. Signed-in users name it and it is kept in the account.
 * Guests see the same button: it explains that saving needs an account and offers to sign
 * in or create one; the save is parked meanwhile and finished on return (pendingSave.ts).
 */
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { Dialog } from '../../components/ui/Dialog.tsx';
import { InputField } from '../../components/ui/InputField.tsx';
import { api, errorMessage } from '../../lib/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import type { SavedData } from './loadIntoExplorer.ts';
import { storePendingSave } from './pendingSave.ts';

interface SaveButtonProps {
  kind: 'curve' | 'point';
  data: SavedData;
  /** Name suggested in the box. */
  defaultName: string;
  /** Text on the button, for example "Save curve". */
  label: string;
}

/** The button, its naming dialog for signed-in users and its explanation for guests. */
export function SaveButton({ kind, data, defaultName, label }: SaveButtonProps) {
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === '') {
      setError('Give it a name.');
      return;
    }
    try {
      await api('POST', '/api/saved', { kind, name: name.trim(), data });
      setOpen(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  /** Park the save and go to the sign-in or sign-up page. */
  function continueTo(path: '/signin' | '/signup') {
    storePendingSave({ kind, name: defaultName, data, returnTo: location.pathname });
    setOpen(false);
    navigate(path);
  }

  const thing = kind === 'curve' ? 'curve' : 'point';

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={saved ? 'check' : 'save'}
        onClick={() => {
          setName(defaultName);
          setError(null);
          setOpen(true);
        }}
      >
        {saved ? 'Saved' : label}
      </Button>
      {user ? (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={`Save this ${thing}`}
          description="It will appear under My work in your account, ready to load again."
          testId="save-dialog"
        >
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <InputField label="Name" value={name} onChange={setName} maxLength={60} autoFocus />
            {error && (
              <Callout tone="danger" role="alert">
                {error}
              </Callout>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon="save">
                Save
              </Button>
            </div>
          </form>
        </Dialog>
      ) : (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Saving needs an account"
          description={`Everything in OnCurve works without an account. To keep this ${thing} under My work, sign in or create a free account.`}
          testId="guest-save-dialog"
        >
          {status === 'ready' ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-soft">
                You will come straight back to this screen, and “
                <span className="font-medium text-ink">{defaultName}</span>” will be saved for you.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Not now
                </Button>
                <Button onClick={() => continueTo('/signup')}>Create account</Button>
                <Button variant="primary" icon="user" onClick={() => continueTo('/signin')}>
                  Sign in
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Callout tone="warning" title="Accounts are not available right now">
                The app could not reach its server, so signing in is not possible at the moment.
                Everything else keeps working.
              </Callout>
              <div className="flex justify-end">
                <Button variant="primary" onClick={() => setOpen(false)}>
                  OK
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
