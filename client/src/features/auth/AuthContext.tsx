/**
 * Who is signed in, for the whole website. On start-up it asks the server for the
 * session; it offers sign-in, sign-up, sign-out and recovery, loads the account's saved
 * preferences after signing in, and records calculations in the account's history.
 * Without a server (or when it cannot be reached) the app simply runs as a guest.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setCsrfToken } from '../../lib/api.ts';
import { PROGRESS_EVENT } from '../../lib/progress.ts';
import { PRACTICE_KEY_NAME } from '../practice/practiceRecord.ts';
import { usePreferences, type TextSize, type Theme } from '../preferences/PreferencesContext.tsx';
import { TOUR_DONE_KEY } from '../tutorial/TutorialContext.tsx';

/** The account as the server describes it. */
export interface PublicUser {
  email: string;
  twoFactor: boolean;
  createdAt: number;
}

/** One calculation for the history. */
export interface HistoryEntry {
  operation: 'points' | 'add' | 'multiply';
  input: Record<string, string | boolean>;
  result: string;
}

/** Preferences and progress kept in the account. */
interface StoredSettings {
  theme?: Theme;
  textSize?: TextSize;
  tourDone?: boolean;
  practice?: { attempted: number; solved: number };
}

/** The outcome of a sign-in attempt that did not fail. */
export type SignInOutcome = 'signed-in' | 'second-factor';

interface AuthContextValue {
  /** 'loading' until the server answered; 'unavailable' when it cannot be reached. */
  status: 'loading' | 'ready' | 'unavailable';
  user: PublicUser | null;
  /** Unused recovery codes, when signed in. */
  recoveryCodesLeft: number | null;
  /** Ask the server again who is signed in. */
  refresh: () => Promise<void>;
  signIn: (email: string, password: string, code?: string) => Promise<SignInOutcome>;
  /** Create an account; returns the recovery codes to show once. */
  signUp: (email: string, password: string) => Promise<string[]>;
  signOut: () => Promise<void>;
  /** Reset a lost password with a recovery code (and sign in). */
  recover: (email: string, recoveryCode: string, newPassword: string) => Promise<void>;
  /** Save a calculation in the history; does nothing for guests and never throws. */
  recordHistory: (entry: HistoryEntry) => void;
  /** Mark that the account changed (2FA on/off, account deleted), so it is reloaded. */
  setUser: (user: PublicUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Read a value from local storage, or null when it is missing or storage is blocked. */
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a value to local storage, ignoring blocked storage. */
function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Without storage the value only lasts for this visit, which is fine.
  }
}

/** Holds the sign-in state. Wrap the app in it once, inside the preferences provider. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [codesLeft, setCodesLeft] = useState<number | null>(null);
  const { theme, textSize, setTheme, setTextSize } = usePreferences();

  const refresh = useCallback(async () => {
    try {
      const session = await api<{
        user: PublicUser | null;
        csrfToken: string;
        recoveryCodesLeft: number | null;
      }>('GET', '/api/auth/session');
      setCsrfToken(session.csrfToken);
      setUser(session.user);
      setCodesLeft(session.recoveryCodesLeft);
      setStatus('ready');
    } catch {
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** After signing in, bring in the account's preferences and progress. */
  const loadSettings = useCallback(async () => {
    try {
      const { settings } = await api<{ settings: StoredSettings }>('GET', '/api/settings');
      if (settings.theme) setTheme(settings.theme);
      if (settings.textSize) setTextSize(settings.textSize);
      if (settings.tourDone) writeStorage(TOUR_DONE_KEY, '1');
      if (settings.practice) writeStorage(PRACTICE_KEY_NAME, JSON.stringify(settings.practice));
    } catch {
      // Preferences are a comfort, not essential: the app keeps the current ones.
    }
  }, [setTheme, setTextSize]);

  // While signed in, keep the account's copy of the theme and text size up to date.
  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void api('PUT', '/api/settings', { theme, textSize }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [user, theme, textSize]);

  // Tour and practice progress is saved when those parts of the app announce a change.
  useEffect(() => {
    if (!user) return;
    const save = () => {
      const practice = readStorage(PRACTICE_KEY_NAME);
      const body: StoredSettings = { tourDone: readStorage(TOUR_DONE_KEY) === '1' };
      if (practice) {
        try {
          body.practice = JSON.parse(practice) as StoredSettings['practice'];
        } catch {
          // A damaged record is simply not sent.
        }
      }
      void api('PUT', '/api/settings', body).catch(() => undefined);
    };
    window.addEventListener(PROGRESS_EVENT, save);
    return () => window.removeEventListener(PROGRESS_EVENT, save);
  }, [user]);

  const signIn = useCallback(
    async (email: string, password: string, code?: string): Promise<SignInOutcome> => {
      const result = await api<{ status: SignInOutcome; user?: PublicUser }>(
        'POST',
        '/api/auth/signin',
        code ? { email, password, code } : { email, password },
      );
      if (result.status === 'signed-in') {
        await refresh();
        await loadSettings();
      }
      return result.status;
    },
    [refresh, loadSettings],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const result = await api<{ recoveryCodes: string[] }>('POST', '/api/auth/signup', {
        email,
        password,
      });
      await refresh();
      // A new account starts from the preferences already chosen in this browser.
      void api('PUT', '/api/settings', { theme, textSize }).catch(() => undefined);
      return result.recoveryCodes;
    },
    [refresh, theme, textSize],
  );

  const signOut = useCallback(async () => {
    await api('POST', '/api/auth/signout');
    setUser(null);
    setCodesLeft(null);
  }, []);

  const recover = useCallback(
    async (email: string, recoveryCode: string, newPassword: string) => {
      await api('POST', '/api/auth/recover', { email, recoveryCode, newPassword });
      await refresh();
      await loadSettings();
    },
    [refresh, loadSettings],
  );

  const recordHistory = useCallback(
    (entry: HistoryEntry) => {
      if (!user) return;
      void api('POST', '/api/history', entry).catch(() => undefined);
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      recoveryCodesLeft: codesLeft,
      refresh,
      signIn,
      signUp,
      signOut,
      recover,
      recordHistory,
      setUser,
    }),
    [status, user, codesLeft, refresh, signIn, signUp, signOut, recover, recordHistory],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Read the sign-in state and actions.
 *
 * @throws when used outside {@link AuthProvider}, which is a programming mistake.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
