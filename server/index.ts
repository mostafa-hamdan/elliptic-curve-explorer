/**
 * Entry point: loads the settings, opens the database, starts the web server, prints the
 * address and, when started with `npm start`, opens it in the default browser.
 * If the usual port is taken, it tries the next few ports instead of giving up.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { buildApp, DEFAULT_CLIENT_DIR } from './app.ts';
import { loadConfig, type ServerConfig } from './config.ts';
import { databaseAddress, openDatabase, type Database } from './db/client.ts';
import { loadEnvFile, optionalEnv } from './env.ts';

loadEnvFile();

/** Port tried first when `PORT` is not set. */
const DEFAULT_PORT = 3000;
/** How many further ports are tried when the first one is busy. */
const EXTRA_PORTS = 9;

/**
 * Address to bind to. The default is this computer only, so nothing is exposed to the
 * network during a local demo. "localhost" makes the server listen on both loopback
 * addresses (127.0.0.1 and ::1), so http://localhost works at once whichever one the
 * browser tries first. A hosting platform sets `HOST` when it needs to.
 */
const host = optionalEnv('HOST') ?? 'localhost';

/**
 * Open a web address in the default browser. Failure is harmless: the address is printed
 * anyway, so the user can open it by hand.
 *
 * @param url - the address to open; always the server's own http://localhost address.
 */
function openBrowser(url: string): void {
  const windows = process.platform === 'win32';
  const [command, args]: [string, string[]] = windows
    ? // The empty "" is the window title that `start` expects before the address. The
      // arguments are passed verbatim so Node does not escape those quotes.
      ['cmd.exe', ['/c', 'start', '""', `"${url}"`]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: windows,
    });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // No browser could be started (for example on a server without a screen).
  }
}

/**
 * Ask whether OnCurve itself is already answering on a port, so a second `npm start`
 * opens the running copy instead of starting another one.
 *
 * @param port - the port to ask.
 * @returns true when an OnCurve health check answers there.
 */
async function isOnCurveRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    const body = (await response.json()) as { app?: string };
    return body.app === 'oncurve';
  } catch {
    return false;
  }
}

/**
 * Check that a port is free on both loopback addresses before using it.
 *
 * Listening on "localhost" covers 127.0.0.1 and ::1. If another program already holds
 * the port on only one of them, the server could start but the browser might reach the
 * other program, so a port counts as free only when both addresses are free.
 *
 * @param port - the port to test.
 * @returns true when nothing else is listening on it.
 */
async function portIsFree(port: number): Promise<boolean> {
  const tryAddress = (address: string) =>
    new Promise<boolean>((resolve) => {
      const probe = createServer();
      probe.once('error', (error: NodeJS.ErrnoException) => {
        // A computer without IPv6 cannot use ::1 at all; that does not mean "in use".
        resolve(error.code !== 'EADDRINUSE' && error.code !== 'EACCES');
      });
      probe.listen({ port, host: address, exclusive: true }, () =>
        probe.close(() => resolve(true)),
      );
    });
  return (await tryAddress('127.0.0.1')) && (await tryAddress('::1'));
}

/** Read and check the PORT setting. */
function requestedPort(): number | null {
  const text = optionalEnv('PORT');
  if (text === undefined) return null;
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`PORT must be a whole number between 1 and 65535, but got "${text}".`);
    process.exit(1);
  }
  return port;
}

if (!existsSync(DEFAULT_CLIENT_DIR)) {
  console.warn(
    'The website has not been built yet. Run "npm run build" first, or use "npm start".',
  );
}

let config: ServerConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

let db: Database;
try {
  ({ db } = await openDatabase(
    databaseAddress(optionalEnv('DATABASE_URL')),
    optionalEnv('DATABASE_AUTH_TOKEN'),
  ));
} catch (error) {
  console.error('The database could not be opened.');
  console.error(error instanceof Error ? error.message : error);
  console.error('Run "npm run setup" to create it, then try again.');
  process.exit(1);
}

const fixedPort = requestedPort();
const candidates =
  fixedPort !== null
    ? [fixedPort]
    : Array.from({ length: EXTRA_PORTS + 1 }, (_, index) => DEFAULT_PORT + index);
const shouldOpen = process.env.OPEN_BROWSER === '1';

const app = await buildApp({ config, db, logger: false });
let started: number | null = null;

for (const port of candidates) {
  // The free-port check is for the local default address only; a hosting platform that
  // sets HOST manages its own ports.
  if (host !== 'localhost' || (await portIsFree(port))) {
    try {
      await app.listen({ port, host });
      started = port;
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EADDRINUSE' && code !== 'EACCES') {
        console.error(
          `Could not start the server: ${error instanceof Error ? error.message : error}`,
        );
        process.exit(1);
      }
    }
  }
  if (await isOnCurveRunning(port)) {
    const url = `http://localhost:${port}`;
    console.info(`OnCurve is already running at ${url}`);
    if (shouldOpen) openBrowser(url);
    await app.close();
    process.exit(0);
  }
  console.warn(`Port ${port} is used by another program; trying the next one.`);
}

if (started === null) {
  console.error(`Could not start the server: ports ${candidates.join(', ')} are all in use.`);
  console.error('Close another program, or choose a free port, for example: PORT=4000 npm start');
  process.exit(1);
}

const url = `http://localhost:${started}`;
console.info(`\nOnCurve is running at ${url}`);
if (!config.anthropicApiKey) {
  console.info('The assistant uses its offline helper (no ANTHROPIC_API_KEY in .env).');
}
console.info('Keep this window open while you use the app. Press Ctrl+C to stop.\n');
if (shouldOpen) openBrowser(url);
