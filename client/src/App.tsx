/**
 * The root component: sets up the display preferences, the sign-in state, the shared
 * Explorer state, the app-wide pop-ups, the guided tour and the page routes. The site
 * opens on the landing page; the Explorer itself is at /explorer. The Explorer
 * state sits above the routes on purpose, so visiting another page and coming back does
 * not lose any work.
 */
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell.tsx';
import { AuthProvider } from './features/auth/AuthContext.tsx';
import { ExplorerProvider } from './features/explorer/ExplorerContext.tsx';
import { PreferencesProvider } from './features/preferences/PreferencesContext.tsx';
import { ShellProvider } from './features/shell/ShellContext.tsx';
import { TutorialProvider } from './features/tutorial/TutorialContext.tsx';
import { AccountPage } from './pages/AccountPage.tsx';
import { RecoverPage } from './pages/auth/RecoverPage.tsx';
import { SignInPage } from './pages/auth/SignInPage.tsx';
import { SignUpPage } from './pages/auth/SignUpPage.tsx';
import { ExplorerPage } from './pages/ExplorerPage.tsx';
import { HelpPage } from './pages/HelpPage.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { LearnPage } from './pages/LearnPage.tsx';
import { LearnTopicPage } from './pages/LearnTopicPage.tsx';
import { LimitationsPage } from './pages/LimitationsPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { PracticePage } from './pages/PracticePage.tsx';
import { ReportPage } from './pages/ReportPage.tsx';
import { SecurityPage } from './pages/SecurityPage.tsx';

/** The whole application. */
export function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <ExplorerProvider>
          <ShellProvider>
            <TutorialProvider>
              <BrowserRouter>
                <Routes>
                  <Route element={<AppShell />}>
                    <Route index element={<LandingPage />} />
                    <Route path="explorer" element={<ExplorerPage />} />
                    <Route path="learn" element={<LearnPage />} />
                    <Route path="learn/:topic" element={<LearnTopicPage />} />
                    <Route path="practice" element={<PracticePage />} />
                    <Route path="help" element={<HelpPage />} />
                    <Route path="report" element={<ReportPage />} />
                    <Route path="limitations" element={<LimitationsPage />} />
                    <Route path="security" element={<SecurityPage />} />
                    <Route path="signin" element={<SignInPage />} />
                    <Route path="signup" element={<SignUpPage />} />
                    <Route path="recover" element={<RecoverPage />} />
                    <Route path="account" element={<AccountPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </TutorialProvider>
          </ShellProvider>
        </ExplorerProvider>
      </AuthProvider>
    </PreferencesProvider>
  );
}
