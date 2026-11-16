/**
 * Which app-wide pop-up is open (settings, keyboard shortcuts, the assistant). Only one is
 * open at a time, and any part of the app (a header button, a keyboard shortcut, the Help
 * page) can open one through this shared state.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/** The app-wide pop-ups. */
export type ShellPanel = 'settings' | 'shortcuts' | 'assistant';

interface ShellContextValue {
  /** The pop-up that is open, or null. */
  panel: ShellPanel | null;
  /** Open a pop-up, closing any other. */
  openPanel: (panel: ShellPanel) => void;
  /** Close whatever is open. */
  closePanel: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

/** Holds the pop-up state. Wrap the app in it once. */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<ShellPanel | null>(null);
  const openPanel = useCallback((next: ShellPanel) => setPanel(next), []);
  const closePanel = useCallback(() => setPanel(null), []);
  const value = useMemo(() => ({ panel, openPanel, closePanel }), [panel, openPanel, closePanel]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/**
 * Read and change which pop-up is open.
 *
 * @throws when used outside {@link ShellProvider}, which is a programming mistake.
 */
export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (value === null) throw new Error('useShell must be used inside ShellProvider.');
  return value;
}
