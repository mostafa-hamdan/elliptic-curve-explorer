/**
 * The assistant panel's width: dragged by its edge, set with the arrow keys or toggled
 * between normal and wide, and remembered in this browser. On a small screen the panel
 * always fills the width, so there is nothing to resize.
 */
import { useCallback, useEffect, useState } from 'react';

/** Key in the browser's local storage. */
export const PANEL_WIDTH_KEY = 'oncurve.assistantWidth';
/** Narrowest and default widths, in pixels. */
export const PANEL_MIN_WIDTH = 320;
export const PANEL_DEFAULT_WIDTH = 420;
/** The "wide" width of the expand button. */
export const PANEL_WIDE_WIDTH = 720;
/** Below this window width the panel fills the screen and cannot be resized. */
export const SMALL_SCREEN = 640;
/** Room always left for the page beside the panel, in pixels. */
const PAGE_MARGIN = 80;

/**
 * Keep a width inside the allowed range for this window.
 *
 * @param width - the wanted width.
 * @param viewport - the window width.
 * @returns the width, between {@link PANEL_MIN_WIDTH} and the window width minus a margin.
 */
export function clampPanelWidth(width: number, viewport: number): number {
  const max = Math.max(PANEL_MIN_WIDTH, viewport - PAGE_MARGIN);
  return Math.round(Math.min(max, Math.max(PANEL_MIN_WIDTH, width)));
}

/** The remembered width, or the default when none is stored (or storage is blocked). */
function storedWidth(): number {
  try {
    const value = Number(window.localStorage.getItem(PANEL_WIDTH_KEY));
    return Number.isFinite(value) && value > 0 ? value : PANEL_DEFAULT_WIDTH;
  } catch {
    return PANEL_DEFAULT_WIDTH;
  }
}

/** The panel width state and the actions that change it. */
export interface PanelWidth {
  /** The width to draw, already fitted to the window. */
  width: number;
  /** True on a small screen: full width, no resizing. */
  fullScreen: boolean;
  /** True when the panel is at least as wide as the "wide" setting. */
  wide: boolean;
  /** Set a width while dragging (not yet remembered). */
  preview: (width: number) => void;
  /** Set a width and remember it. */
  commit: (width: number) => void;
  /** Switch between the normal and the wide width. */
  toggleWide: () => void;
}

/** Hold the panel width. */
export function usePanelWidth(): PanelWidth {
  const [wanted, setWanted] = useState(storedWidth);
  const [viewport, setViewport] = useState(() => window.innerWidth);

  useEffect(() => {
    const update = () => setViewport(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const commit = useCallback(
    (width: number) => {
      const fitted = clampPanelWidth(width, viewport);
      setWanted(fitted);
      try {
        window.localStorage.setItem(PANEL_WIDTH_KEY, String(fitted));
      } catch {
        // Storage blocked: the width lasts until the page is reloaded.
      }
    },
    [viewport],
  );

  const width = clampPanelWidth(wanted, viewport);
  const wide = width >= Math.min(PANEL_WIDE_WIDTH, viewport - PAGE_MARGIN);
  return {
    width,
    fullScreen: viewport < SMALL_SCREEN,
    wide,
    preview: (next) => setWanted(clampPanelWidth(next, viewport)),
    commit,
    toggleWide: () => commit(wide ? PANEL_DEFAULT_WIDTH : PANEL_WIDE_WIDTH),
  };
}
