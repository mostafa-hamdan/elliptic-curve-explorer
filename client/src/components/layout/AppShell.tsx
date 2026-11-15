/**
 * The frame around every page: the top bar with the logo, the navigation and the theme
 * switch, the main content area, and the footer.
 */
import { NavLink, Outlet } from 'react-router';
import { cx } from '../../lib/cx.ts';
import { useTheme } from '../../features/theme/ThemeContext.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Logo } from './Logo.tsx';

/** Pages listed in the top bar, in order. */
const NAV_ITEMS = [
  { to: '/', label: 'Explorer' },
  { to: '/limitations', label: 'Limitations' },
] as const;

/** Button in the top bar that switches between the light and dark themes. */
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}

/** Page frame. The current page is rendered where `<Outlet />` sits. */
export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Lets keyboard users jump past the top bar straight to the page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-ink"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1480px] items-center gap-6 px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5 rounded-lg" title="OnCurve home">
            <Logo size={30} />
            <span className="flex items-baseline gap-2">
              <span className="text-[17px] font-semibold tracking-tight text-ink">OnCurve</span>
              <span className="hidden text-[13px] text-muted md:inline">
                Elliptic Curve Explorer
              </span>
            </span>
          </NavLink>

          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
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

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[13px] text-muted sm:px-6">
          <p>OnCurve is a learning tool. Do not use it to protect real secrets.</p>
          <NavLink to="/limitations" className="font-medium text-primary hover:underline">
            What this app cannot do
          </NavLink>
        </div>
      </footer>
    </div>
  );
}
