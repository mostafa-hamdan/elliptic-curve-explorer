/**
 * `npm start`: makes sure setup has been done, builds the website, then starts the
 * server and opens the browser. Plain JavaScript so it can explain a missing setup before
 * any dependency is loaded.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The project folder; works with spaces in the path. */
const root = fileURLToPath(new URL('..', import.meta.url));

if (!existsSync(`${root}/node_modules`)) {
  console.error('OnCurve is not set up yet. Run this once first:  npm run setup');
  process.exit(1);
}

// A missing .env is created on the spot, so starting never fails for that reason.
spawnSync('node scripts/ensure-env.mjs', { cwd: root, stdio: 'ignore', shell: true });

console.info('Building the website...');
// Commands are passed as one fixed string: a shell is needed on Windows to find npm.cmd,
// and nothing in these strings comes from user input.
const build = spawnSync('npm run build --silent', {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
  shell: true,
});
if (build.status !== 0) {
  console.error('The website could not be built; the error is shown above.');
  process.exit(build.status ?? 1);
}

// The server runs in this same window; Ctrl+C stops both.
const server = spawn('npx tsx server/index.ts', {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, OPEN_BROWSER: process.env.OPEN_BROWSER ?? '1' },
});
server.on('exit', (code) => process.exit(code ?? 0));
