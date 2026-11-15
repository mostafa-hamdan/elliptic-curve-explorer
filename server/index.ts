/**
 * Entry point: starts the web server and prints the address to open.
 * Run through `npm start` (which builds the website first) or `npm run serve`.
 */
import { existsSync } from 'node:fs';
import { buildApp, DEFAULT_CLIENT_DIR } from './app.ts';

/** Port to listen on. `PORT` in the environment overrides the default of 3000. */
const port = Number(process.env.PORT ?? 3000);

/**
 * Address to bind to. The default is this computer only, so nothing is exposed to the
 * network during a local demo. "localhost" makes the server listen on both loopback
 * addresses (127.0.0.1 and ::1), so http://localhost works at once whichever one the
 * browser tries first. A hosting platform sets `HOST` when it needs to.
 */
const host = process.env.HOST ?? 'localhost';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`PORT must be a whole number between 1 and 65535, but got "${process.env.PORT}".`);
  process.exit(1);
}

if (!existsSync(DEFAULT_CLIENT_DIR)) {
  console.warn(
    'The website has not been built yet. Run "npm run build" first, or use "npm start".',
  );
}

try {
  const app = await buildApp();
  await app.listen({ port, host });
  console.info(`OnCurve is running at http://localhost:${port}`);
  console.info('Press Ctrl+C to stop.');
} catch (error) {
  // The usual cause is another program already using the port.
  console.error(`Could not start the server on port ${port}.`);
  console.error(error instanceof Error ? error.message : error);
  console.error('Close the other program, or choose another port, for example: PORT=3001');
  process.exit(1);
}
