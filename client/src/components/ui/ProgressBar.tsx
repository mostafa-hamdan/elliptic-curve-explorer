/**
 * Progress bar shown while every point of a curve is being found in the background.
 */

interface ProgressBarProps {
  /** Progress from 0 to 1. */
  value: number;
  /** What is progressing, for screen readers. */
  label: string;
}

/** A horizontal bar with the percentage next to it. */
export function ProgressBar({ value, label }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono text-note text-ink-soft">{percent}%</span>
    </div>
  );
}
