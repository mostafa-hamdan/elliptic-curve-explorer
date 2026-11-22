/**
 * Configuration for the browser tests (Playwright).
 * The tests run against the real app: the built website served by the Node server, on
 * port 3100 so they never collide with a copy of the app already running on 3000.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const isCI = Boolean(process.env.CI);
/** The smaller of the two window sizes the app is checked at; some tests also use 1920×1080. */
const viewport = { width: 1366, height: 768 };

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  // A stray `test.only` must never reach the shared branch.
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport,
    trace: 'retain-on-failure',
  },
  webServer: {
    // Build first so the tests always run against the current code.
    command: 'npm run build && npm run serve',
    url: `http://127.0.0.1:${PORT}/api/health`,
    // A fresh in-memory database for every run, its own secret, and limits raised so the
    // many test accounts (all from 127.0.0.1) are not mistaken for an attack.
    env: {
      PORT: String(PORT),
      DATABASE_URL: ':memory:',
      SESSION_SECRET: 'browser-tests-secret-browser-tests-secret',
      SIGNUPS_PER_HOUR: '10000',
      SIGNINS_PER_IP: '10000',
      // Empty on purpose: browser tests must never reach a real AI provider.
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
    },
    // Never reuse a server that is already running: it could be serving an older build.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport },
    },
    // Firefox runs only on request (PW_FIREFOX=1). It is not supported yet: see the
    // Limitations page. CI runs it in a separate job that does not block a change.
    ...(process.env.PW_FIREFOX
      ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } }]
      : []),
    // The copy of Microsoft Edge installed on the computer, on request (PW_EDGE=1).
    ...(process.env.PW_EDGE
      ? [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport } }]
      : []),
  ],
});
