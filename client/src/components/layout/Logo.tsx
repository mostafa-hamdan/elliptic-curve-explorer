/**
 * The OnCurve mark: a small elliptic curve with one highlighted point.
 * Drawn inline so it follows the theme colours and needs no image file.
 */

interface LogoProps {
  /** Width and height in pixels. */
  size?: number;
}

/** The square logo. Decorative: the wordmark next to it carries the name. */
export function Logo({ size = 32 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M25 5.5C17 9 13.5 11.5 13.5 16S17 23 25 26.5M13.5 16c0-3.2-1.6-5-4-5s-3.8 2-3.8 5 1.4 5 3.8 5 4-1.8 4-5Z"
        fill="none"
        className="stroke-primary-ink"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20.4" cy="8.6" r="2.6" className="fill-point-q-soft" />
    </svg>
  );
}
