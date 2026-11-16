/**
 * Display preferences: light or dark theme, and text size. They are remembered in this
 * browser and applied to the <html> element, where the design tokens pick them up.
 * The first paint is handled by `public/theme-init.js`; this file takes over once the app
 * is running and lets any component read or change the preferences.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'light' | 'dark';

/** Text size steps; `default` follows the browser's own setting. */
export type TextSize = 'small' | 'default' | 'large' | 'larger';

/** Text sizes in menu order, with their labels. */
export const TEXT_SIZES: ReadonlyArray<{ id: TextSize; label: string }> = [
  { id: 'small', label: 'Small' },
  { id: 'default', label: 'Default' },
  { id: 'large', label: 'Large' },
  { id: 'larger', label: 'Larger' },
];

/** Keys in the browser's local storage. Must match `public/theme-init.js`. */
export const STORAGE_KEYS = {
  theme: 'oncurve.theme',
  textSize: 'oncurve.textSize',
} as const;

interface PreferencesContextValue {
  theme: Theme;
  textSize: TextSize;
  /** Switch between light and dark and remember the choice. */
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setTextSize: (size: TextSize) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/**
 * Save a value in local storage, ignoring failures: storage can be blocked (private
 * mode), and then the choice still applies for this visit.
 */
function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Nothing else to do: the setting still works until the page is closed.
  }
}

/** The text size that `theme-init.js` already put on the <html> element. */
function readInitialTextSize(): TextSize {
  const value = document.documentElement.getAttribute('data-text-size');
  return TEXT_SIZES.some((size) => size.id === value) ? (value as TextSize) : 'default';
}

/** Provides the preferences to the whole app. Wrap the app in it once, at the top. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  );
  const [textSize, setTextSizeState] = useState<TextSize>(readInitialTextSize);

  // Keep the attributes on <html> in step with the state; the tokens react to them.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.setAttribute('data-text-size', textSize);
  }, [textSize]);

  // Paper is white: print in the light theme whatever is on screen, then switch back.
  useEffect(() => {
    const root = document.documentElement;
    const toLight = () => root.setAttribute('data-theme', 'light');
    const restore = () => root.setAttribute('data-theme', theme);
    window.addEventListener('beforeprint', toLight);
    window.addEventListener('afterprint', restore);
    return () => {
      window.removeEventListener('beforeprint', toLight);
      window.removeEventListener('afterprint', restore);
    };
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    // Saved only on an explicit choice, so until then the app follows the system setting.
    remember(STORAGE_KEYS.theme, next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      remember(STORAGE_KEYS.theme, next);
      return next;
    });
  }, []);

  const setTextSize = useCallback((next: TextSize) => {
    remember(STORAGE_KEYS.textSize, next);
    setTextSizeState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, textSize, toggleTheme, setTheme, setTextSize }),
    [theme, textSize, toggleTheme, setTheme, setTextSize],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

/**
 * Read and change the display preferences.
 *
 * @throws when used outside {@link PreferencesProvider}, which is a programming mistake.
 */
export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (value === null) throw new Error('usePreferences must be used inside PreferencesProvider.');
  return value;
}

/** Shorthand for the theme part only, used by components that draw in theme colours. */
export function useTheme(): Pick<PreferencesContextValue, 'theme' | 'toggleTheme'> {
  const { theme, toggleTheme } = usePreferences();
  return { theme, toggleTheme };
}
