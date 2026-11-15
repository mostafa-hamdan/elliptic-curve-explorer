/**
 * Light and dark theme: remembers the visitor's choice and applies it to the page.
 * The first paint is handled by `public/theme-init.js`; this file takes over once the
 * app is running and lets components read or switch the theme.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'light' | 'dark';

/** Key in the browser's local storage. Must match `public/theme-init.js`. */
const STORAGE_KEY = 'oncurve.theme';

interface ThemeContextValue {
  theme: Theme;
  /** Switch between light and dark and remember the choice. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Read the theme that `theme-init.js` already put on the <html> element. */
function readInitialTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Provides the theme to the whole app. Wrap the app in it once, at the top. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  // Keep the attribute on <html> in step with the state; the tokens react to it.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      try {
        // Saved only on an explicit choice, so until then the app follows the system.
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage can be blocked (private mode); the theme still changes for this visit.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Read the current theme and the function that switches it.
 *
 * @throws when used outside {@link ThemeProvider}, which is a programming mistake.
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used inside ThemeProvider.');
  return value;
}
