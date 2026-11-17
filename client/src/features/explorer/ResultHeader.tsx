/**
 * The headline of a result: "P + Q = (17, 20)" in large type with a copy button, plus a
 * short label naming the rule that was used. Shared by the Add and Multiply tabs so
 * both results look the same.
 */
import type { ReactNode } from 'react';
import type { Point } from '@shared/ecc/index.ts';
import { CopyButton } from '../../components/ui/CopyButton.tsx';
import { pointText } from '../../lib/format.ts';

interface ResultHeaderProps {
  /** Left-hand side of the equation, for example "P + Q" or "13P". */
  expression: ReactNode;
  /** The answer. */
  result: Point;
  /** Short label for the rule that applied, for example "Chord rule". */
  rule?: string;
  /** One line under the headline, for example the inputs that were used. */
  detail?: ReactNode;
  /** Hook for browser tests on the answer text. */
  testId: string;
}

/** Large result line with a copy button. The answer is green, the color of results. */
export function ResultHeader({ expression, result, rule, detail, testId }: ResultHeaderProps) {
  const text = pointText(result);
  return (
    <div className="rounded-xl border border-point-r/30 bg-point-r-soft px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-point-r uppercase">
            Result{rule ? ` · ${rule}` : ''}
          </p>
          <p className="mt-1 font-mono text-xl leading-snug font-semibold wrap-anywhere text-ink">
            <span className="text-ink-soft">{expression} = </span>
            <span data-testid={testId}>{text}</span>
          </p>
          {result === null && (
            <p className="mt-0.5 text-note text-ink-soft">
              O is the point at infinity, the identity element of the group.
            </p>
          )}
        </div>
        <CopyButton text={text} label="Copy result" />
      </div>
      {detail && <div className="mt-2 text-note text-ink-soft">{detail}</div>}
    </div>
  );
}
