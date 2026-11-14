/**
 * Configuration for the unit and property tests (engine and server).
 * Browser tests live in `tests/e2e` and are run by Playwright instead, so they are
 * excluded here.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // The exhaustive checks walk every curve over several primes, so allow extra time.
    testTimeout: 120_000,
  },
});
