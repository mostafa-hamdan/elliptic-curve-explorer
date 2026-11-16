/**
 * The frame around every page: the top bar with the logo, the navigation and the quick
 * controls, the main content area, the footer, and the app-wide pop-ups (settings,
 * keyboard shortcuts, the guided tour). It also listens for the keyboard shortcuts.
 */
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { cx } from '../../lib/cx.ts';
import { AssistantPanel } from '../../features/assistant/AssistantPanel.tsx';
import { useAuth } from '../../features/auth/AuthContext.tsx';
import { useExplorer } from '../../features/explorer/ExplorerContext.tsx';
import { usePreferences } from '../../features/preferences/PreferencesContext.tsx';
import { SettingsDialog } from '../../features/preferences/SettingsDialog.tsx';
import { ShortcutsDialog } from '../../features/preferences/ShortcutsDialog.tsx';
import { isTypingTarget, shortcutFor } from '../../features/preferences/shortcuts.ts';
import { useShell } from '../../features/shell/ShellContext.tsx';
import { TourOverlay } from '../../features/tutorial/TourOverlay.tsx';
import { useTutorial } from '../../features/tutorial/TutorialContext.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { Logo } from './Logo.tsx';

/** Pages listed in the top bar, in order. */
export const NAV_ITEMS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/', label: 'Explorer' },
  { to: '/learn', label: 'Learn' },
  { to: '/practice', label: 'Practice' },
  { to: '/help', label: 'Help' },
  { to: '/limitations', label: 'Limitations' },
];

interface HeaderButtonProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  /** Marks the button for the guided tour. */
  tour?: string;
  /** Show the label next to the icon on wide screens. */
  showLabel?: boolean;
}

/** A square icon button in the top bar, with a tooltip and an accessible name. */
function HeaderButton({ icon, label, onClick, tour, showLabel }: HeaderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-tour={tour}
      className={cx(
        'inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface text-ink-soft transition-colors hover:bg-sunken hover:text-ink',
        showLabel ? 'w-9 xl:w-auto xl:px-3' : 'w-9',
      )}
    >
      <Icon name={icon} size={17} />
      {showLabel && <span className="hidden text-sm font-medium xl:inline">{label}</span>}
    </button>
  );
}

/**
 * Handle the keyboard shortcuts for the whole app (see `shortcuts.ts` for the list).
 * Shortcuts are off while a dialog or the tour is open.
 */
function useGlobalShortcuts(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const { setTab } = useExplorer();
  const { toggleTheme } = usePreferences();
  const { openPanel } = useShell();
  const tutorial = useTutorial();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || tutorial.active) return;
      if (document.querySelector('dialog[open]')) return;
      const action = shortcutFor({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        typing: isTypingTarget(document.activeElement),
      });
      if (action === null) return;
      event.preventDefault();

      const goExplorer = () => {
        if (location.pathname !== '/') navigate('/');
      };
      switch (action) {
        case 'tab-points':
        case 'tab-add':
        case 'tab-multiply':
          goExplorer();
          setTab(action === 'tab-points' ? 'points' : action === 'tab-add' ? 'add' : 'multiply');
          break;
        case 'focus-curve':
          goExplorer();
          // Wait a frame in case the Explorer page is still being drawn.
          requestAnimationFrame(() => document.getElementById('curve-p')?.focus());
          break;
        case 'toggle-theme':
          toggleTheme();
          break;
        case 'show-shortcuts':
          openPanel('shortcuts');
          break;
        case 'open-assistant':
          openPanel('assistant');
          break;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [location.pathname, navigate, setTab, toggleTheme, openPanel, tutorial.active]);
}

/**
 * The account control at the right of the top bar: "Sign in" for guests, or a button to
 * the account page showing who is signed in. Hidden when accounts are not available.
 */
function AccountButton() {
  const { status, user } = useAuth();
  if (status !== 'ready') return null;
  if (!user) {
    return (
      <NavLink
        to="/signin"
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover"
      >
        <Icon name="user" size={16} />
        <span className="hidden sm:inline">Sign in</span>
        <span className="sr-only sm:hidden">Sign in</span>
      </NavLink>
    );
  }
  return (
    <NavLink
      to="/account"
      title={`Signed in as ${user.email}`}
      className={({ isActive }) =>
        cx(
          'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'border-primary/40 bg-primary-soft text-primary'
            : 'border-line bg-surface text-ink-soft hover:bg-sunken hover:text-ink',
        )
      }
      data-testid="account-button"
    >
      {/* The initial is decoration; the name read out is "Account" plus the email. */}
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-ink uppercase"
      >
        {user.email.charAt(0)}
      </span>
      <span className="sr-only lg:not-sr-only">Account</span>
      <span className="sr-only"> ({user.email})</span>
    </NavLink>
  );
}

/** Page frame. The current page is rendered where `<Outlet />` sits. */
export function AppShell() {
  const { theme, toggleTheme } = usePreferences();
  const { openPanel } = useShell();
  useGlobalShortcuts();

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className="flex min-h-screen flex-col">
      {/* Lets keyboard users jump past the top bar straight to the page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-ink"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 w-full max-w-[1480px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <NavLink
            to="/"
            className="flex shrink-0 items-center gap-2.5 rounded-lg"
            title="OnCurve home"
          >
            <Logo size={30} />
            <span className="hidden items-baseline gap-2 sm:flex">
              <span className="text-[1.0625rem] font-semibold tracking-tight text-ink">
                OnCurve
              </span>
              <span className="hidden text-note text-muted 2xl:inline">
                Elliptic Curve Explorer
              </span>
            </span>
          </NavLink>

          <nav
            aria-label="Main"
            data-tour="nav"
            className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-1"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-primary-soft text-primary'
                      : 'text-ink-soft hover:bg-sunken hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <HeaderButton
              icon="sparkle"
              label="Assistant"
              tour="assistant"
              showLabel
              onClick={() => openPanel('assistant')}
            />
            <HeaderButton
              icon="sliders"
              label="Display settings"
              tour="settings"
              onClick={() => openPanel('settings')}
            />
            <HeaderButton
              icon={theme === 'dark' ? 'sun' : 'moon'}
              label={`Switch to ${nextTheme} theme`}
              onClick={toggleTheme}
            />
            <AccountButton />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-line print:hidden">
        <div className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-note text-muted sm:px-6">
          <p>OnCurve is a learning tool. Do not use it to protect real secrets.</p>
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => openPanel('shortcuts')}
              className="cursor-pointer font-medium text-primary hover:underline"
            >
              Keyboard shortcuts
            </button>
            <NavLink to="/security" className="font-medium text-primary hover:underline">
              Security
            </NavLink>
            <NavLink to="/limitations" className="font-medium text-primary hover:underline">
              What this app cannot do
            </NavLink>
          </div>
        </div>
      </footer>

      <AssistantPanel />
      <SettingsDialog />
      <ShortcutsDialog />
      <TourOverlay />
    </div>
  );
}
