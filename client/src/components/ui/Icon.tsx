/**
 * The app's icon set, drawn as inline SVG so no icon font or outside request is needed.
 * Every icon uses the current text colour and the same stroke, which keeps them
 * consistent with whatever button or message they sit in.
 */

/** SVG path data for each icon, on a 24 × 24 grid. Several sub-paths are joined by spaces. */
const ICON_PATHS = {
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  copy: 'M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2ZM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  check: 'M20 6 9 17l-5-5',
  alert:
    'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 16v-4M12 8h.01',
  close: 'M18 6 6 18M6 6l12 12',
  checkCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M9 11l3 3L22 4',
  errorCircle: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM15 9l-6 6M9 9l6 6',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronsLeft: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  chevronsRight: 'M6 17l5-5-5-5M13 17l5-5-5-5',
  chevronDown: 'M6 9l6 6 6-6',
  swap: 'M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4',
  trash:
    'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  play: 'M6 3l14 9-14 9V3Z',
  stop: 'M6 6h12v12H6Z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  plus: 'M5 12h14M12 5v14',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM14 14h7v7h-7ZM3 14h7v7H3Z',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
} as const;

/** Names of the available icons. */
export type IconName = keyof typeof ICON_PATHS;

interface IconProps {
  /** Which icon to draw. */
  name: IconName;
  /** Width and height in pixels. Defaults to 18. */
  size?: number;
  /** Extra classes, for example a colour. */
  className?: string;
}

/**
 * Draw one icon. Icons are decoration: the control they sit in carries the real label,
 * so the SVG is hidden from screen readers.
 */
export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
