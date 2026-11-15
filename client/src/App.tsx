/**
 * The root component: sets up the theme, the shared Explorer state and the page routes.
 * The Explorer state sits above the routes on purpose, so visiting another page and
 * coming back does not lose the curve or the results.
 */
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell.tsx';
import { ExplorerProvider } from './features/explorer/ExplorerContext.tsx';
import { ThemeProvider } from './features/theme/ThemeContext.tsx';
import { ExplorerPage } from './pages/ExplorerPage.tsx';
import { LimitationsPage } from './pages/LimitationsPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

/** The whole application. */
export function App() {
  return (
    <ThemeProvider>
      <ExplorerProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<ExplorerPage />} />
              <Route path="limitations" element={<LimitationsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ExplorerProvider>
    </ThemeProvider>
  );
}
