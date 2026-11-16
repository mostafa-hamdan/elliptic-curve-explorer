/**
 * The small row of export buttons under a result: download it as a CSV file, or open the
 * printable report of everything calculated so far.
 */
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.tsx';
import { downloadText } from '../../lib/download.ts';

interface ResultActionsProps {
  /** Label of the CSV button, for example "Download steps (CSV)". */
  csvLabel: string;
  /** Builds the file only when the button is pressed, so large results cost nothing. */
  makeCsv: () => { text: string; filename: string };
  /** Hook for browser tests. */
  testId?: string;
}

/** Export buttons for one result. */
export function ResultActions({ csvLabel, makeCsv, testId }: ResultActionsProps) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap gap-2 print:hidden" data-testid={testId}>
      <Button
        size="sm"
        icon="download"
        onClick={() => {
          const { text, filename } = makeCsv();
          downloadText(text, filename);
        }}
      >
        {csvLabel}
      </Button>
      <Button size="sm" variant="ghost" icon="printer" onClick={() => navigate('/report')}>
        Printable report
      </Button>
    </div>
  );
}
