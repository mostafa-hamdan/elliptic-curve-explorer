/**
 * Shows a set of recovery codes once, with buttons to copy or download them. They are the
 * only way back into an account after a lost password, because the app never sends email.
 */
import { Button } from '../../components/ui/Button.tsx';
import { Callout } from '../../components/ui/Callout.tsx';
import { CopyButton } from '../../components/ui/CopyButton.tsx';
import { downloadText } from '../../lib/download.ts';

interface RecoveryCodesProps {
  codes: string[];
  email: string;
}

/** The codes in a grid, with the warning to keep them safe. */
export function RecoveryCodes({ codes, email }: RecoveryCodesProps) {
  const text = `OnCurve recovery codes for ${email}\nEach code works once.\n\n${codes.join('\n')}\n`;
  return (
    <div className="space-y-4" data-testid="recovery-codes">
      <Callout tone="warning" title="Save these codes now">
        They are shown only this once. If you forget your password or lose your authenticator app, a
        code is the only way back in: the app never sends email. Each code works once.
      </Callout>
      <ol className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-sunken p-4 font-mono text-sm sm:grid-cols-2">
        {codes.map((code) => (
          <li
            key={code}
            className="rounded-md bg-surface px-3 py-1.5 text-center tracking-wider text-ink"
          >
            {code}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={codes.join('\n')} label="Copy the codes" />
        <Button
          size="sm"
          icon="download"
          onClick={() => downloadText(text, 'oncurve-recovery-codes.txt', 'text/plain')}
        >
          Download as a text file
        </Button>
      </div>
    </div>
  );
}
