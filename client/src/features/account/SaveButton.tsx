/**
 * "Save" for a curve or a point: asks for a name and keeps it in the account. Shown only
 * to signed-in users; guests do not see it at all.
 */
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { Dialog } from '../../components/ui/Dialog.tsx';
import { InputField } from '../../components/ui/InputField.tsx';
import { api, errorMessage } from '../../lib/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import type { SavedData } from './loadIntoExplorer.ts';

interface SaveButtonProps {
  kind: 'curve' | 'point';
  data: SavedData;
  /** Name suggested in the box. */
  defaultName: string;
  /** Text on the button, for example "Save curve". */
  label: string;
}

/** The button and its naming dialog. */
export function SaveButton({ kind, data, defaultName, label }: SaveButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

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
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={kind === 'curve' ? 'Save this curve' : 'Save this point'}
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
    </>
  );
}
