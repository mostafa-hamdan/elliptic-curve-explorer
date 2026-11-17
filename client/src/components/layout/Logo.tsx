/**
 * The OnCurve mark: the real curve y² = x³ − x + 1, a chord through two of its points,
 * and the third point where the chord meets the curve, in the accent color. The same
 * picture as the hero on the landing page, shrunk to an icon. Drawn inline so it follows
 * the theme colors and needs no image file.
 */

/**
 * The curve outline, computed once from y = ±√(x³ − x + 1) for x from the root
 * (about −1.3247) to 1.75, scaled into the 32 × 32 box. Kept as data so the icon never
 * has to redo the math.
 */
export const LOGO_CURVE_PATH =
  'M26.1 4.8L24.7 7.2L23.2 9.1L21.9 10.6L20.6 11.6L19.4 11.9L18.2 11.8L17.1 11.4L16.1 10.9L15.1 10.5L14.2 10.2L13.3 10L12.5 9.9L11.8 9.9L11.1 10.1L10.6 10.3L10 10.7L9.5 11.2L9.1 11.7L8.8 12.3L8.5 13L8.3 13.7L8.1 14.4L8 15.2L8 16L8 16.8L8.1 17.6L8.3 18.3L8.5 19L8.8 19.7L9.1 20.3L9.5 20.8L10 21.3L10.6 21.7L11.1 21.9L11.8 22.1L12.5 22.1L13.3 22L14.2 21.8L15.1 21.5L16.1 21.1L17.1 20.6L18.2 20.2L19.4 20.1L20.6 20.4L21.9 21.4L23.2 22.9L24.7 24.8L26.1 27.2';

interface LogoProps {
  /** Width and height in pixels. */
  size?: number;
}

/** The square logo. Decorative: the wordmark next to it carries the name. */
export function Logo({ size = 32 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      {/* The chord through P = (−1, 1) and Q = (0, 1); it meets the curve again at (1, 1). */}
      <path
        d="M5.5 10.8H25"
        className="stroke-primary-ink"
        strokeOpacity="0.45"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d={LOGO_CURVE_PATH}
        fill="none"
        className="stroke-primary-ink"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21.7" cy="10.8" r="2.7" className="fill-accent-bright" />
    </svg>
  );
}
