/**
 * The list of keyboard shortcuts, shown in a dialog (press "?") and on the Help page.
 */
import { Dialog } from '../../components/ui/Dialog.tsx';
import { useShell } from '../shell/ShellContext.tsx';
import { SHORTCUTS } from './shortcuts.ts';

/** One key drawn as a key cap. */
export function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line-strong bg-sunken px-1.5 font-mono text-xs font-semibold text-ink shadow-[0_1px_0_var(--oc-line-strong)]">
      {children}
    </kbd>
  );
}

/** The shortcuts as a two-column table. */
export function ShortcutsTable() {
  return (
    <table className="w-full border-collapse text-sm" data-testid="shortcuts-table">
      <caption className="sr-only">Keyboard shortcuts</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Keys</th>
          <th scope="col">What it does</th>
        </tr>
      </thead>
      <tbody>
        {SHORTCUTS.map((shortcut) => (
          <tr key={shortcut.description} className="border-t border-line first:border-t-0">
            <td className="w-28 py-2 pr-4">
              <span className="flex gap-1">
                {shortcut.keys.map((key) => (
                  <KeyCap key={key}>{key}</KeyCap>
                ))}
              </span>
            </td>
            <td className="py-2 text-ink-soft">{shortcut.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The dialog opened by "?" or from the settings. */
export function ShortcutsDialog() {
  const { panel, closePanel } = useShell();
  return (
    <Dialog
      open={panel === 'shortcuts'}
      onClose={closePanel}
      title="Keyboard shortcuts"
      description="Single keys work when you are not typing in a box. 1, 2 and 3 also work with Alt held."
      testId="shortcuts-dialog"
    >
      <ShortcutsTable />
    </Dialog>
  );
}
