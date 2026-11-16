/**
 * One-time setup, run with `npm run setup`: installs the dependencies, creates the local
 * settings file with a fresh secret, prepares the local database, and builds the website.
 * Every step prints what it is doing, so a failure says exactly where it happened.
 * Plain JavaScript on purpose: it must run before any dependency is installed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The project folder. Built from the file's own location, so spaces in the path are fine. */
const root = fileURLToPath(new URL('..', import.meta.url));

/** Oldest Node.js major version the app supports. */
const MIN_NODE_MAJOR = 22;

/**
 * Run a command in the project folder and stop the setup if it fails.
 *
 * @param title - what the step does, printed before it starts.
 * @param command - the full command line, for example "npm run build".
 * @throws never; exits the process with the command's exit code on failure.
 */
function step(title, command) {
  console.info(`\n> ${title}`);
  // A shell is needed on Windows to find npm.cmd. The command is a fixed string written
  // here, never user input, so nothing can be injected through it.
  const result = spawnSync(command, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\nSetup stopped: "${title}" did not finish (exit code ${result.status}).`);
    console.error('Fix the problem shown above, then run "npm run setup" again.');
    process.exit(result.status ?? 1);
  }
}

const major = Number(process.versions.node.split('.')[0]);
if (major < MIN_NODE_MAJOR) {
  console.error(
    `OnCurve needs Node.js ${MIN_NODE_MAJOR} or newer, but this is ${process.versions.node}.`,
  );
  console.error('Install the current LTS version from https://nodejs.org and try again.');
  process.exit(1);
}

console.info('Setting up OnCurve. This takes a minute or two the first time.');

step('Installing dependencies', 'npm install --no-fund --no-audit');
step('Creating the local settings file (.env)', 'node scripts/ensure-env.mjs');
if (existsSync(`${root}/scripts/db-setup.ts`)) {
  step('Preparing the local database and the demo account', 'npx tsx scripts/db-setup.ts');
}
step('Building the website', 'npm run build');

console.info('\nSetup finished. Start the app with:  npm start');
