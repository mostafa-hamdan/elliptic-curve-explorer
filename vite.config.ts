/**
 * Build configuration for the website (the `client/` folder).
 * The dev server runs on port 5173 and forwards `/api` calls to the Node server on 3000.
 * Paths are built with `fileURLToPath` so they still work when the project folder name
 * contains spaces.
 */
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Turn a path relative to this file into an absolute file-system path. */
const fromRoot = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: fromRoot('./client'),
  plugins: [react(), tailwindcss()],
  resolve: {
    // `@shared/ecc` is the one maths engine used by the website, the server and the tests.
    alias: { '@shared': fromRoot('./shared') },
  },
  build: {
    outDir: fromRoot('./dist/client'),
    emptyOutDir: true,
    target: 'es2022',
    // Never inline files as data: URLs, so the strict Content-Security-Policy (fonts and
    // images only from this site) holds for every file.
    assetsInlineLimit: 0,
  },
  worker: { format: 'es' },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
