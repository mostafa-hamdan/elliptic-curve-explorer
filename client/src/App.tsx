/**
 * The root component: sets up the display preferences, the shared Explorer state, the
 * app-wide pop-ups, the guided tour and the page routes. The Explorer state sits above the
 * routes on purpose, so visiting another page and coming back does not lose any work.
 */
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell.tsx';
import { ExplorerProvider } from './features/explorer/ExplorerContext.tsx';
import { PreferencesProvider } from './features/preferences/PreferencesContext.tsx';
import { ShellProvider } from './features/shell/ShellContext.tsx';
import { TutorialProvider } from './features/tutorial/TutorialContext.tsx';
import { ExplorerPage } from './pages/ExplorerPage.tsx';
import { HelpPage } from './pages/HelpPage.tsx';
import { LearnPage } from './pages/LearnPage.tsx';
import { LimitationsPage } from './pages/LimitationsPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { PracticePage } from './pages/PracticePage.tsx';

/** The whole application. */
export function App() {
  return (
    <PreferencesProvider>
      <ExplorerProvider>
        <ShellProvider>
          <TutorialProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<ExplorerPage />} />
                  <Route path="learn" element={<LearnPage />} />
                  <Route path="practice" element={<PracticePage />} />
                  <Route path="help" element={<HelpPage />} />
                  <Route path="limitations" element={<LimitationsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </TutorialProvider>
        </ShellProvider>
      </ExplorerProvider>
    </PreferencesProvider>
  );
}
