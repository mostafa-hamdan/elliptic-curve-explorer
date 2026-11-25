/**
 * Entry point of the hosted server on Vercel: one function that answers every /api request
 * with the same Fastify app as the local server. The website's files are served by Vercel's
 * CDN (see scripts/vercel-build.mjs). The app is built on the first request of each fresh
 * instance and reused while that instance lives; nothing else is kept in memory, because
 * any request may land on a new instance.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@libsql/client/web';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { prepareDatabase } from './db/prepare.ts';
import { ensureDemoAccount } from './demo.ts';
import { optionalEnv } from './env.ts';

/** The app of this instance, once built. */
let ready: Promise<FastifyInstance> | undefined;

/**
 * Build the app: read the settings, open the Turso database (over HTTPS, no native code),
 * run any new migrations, make sure the demo account exists.
 *
 * @returns the ready app.
 * @throws when a setting is missing or the database cannot be reached.
 */
async function start(): Promise<FastifyInstance> {
  const config = loadConfig();
  const url = optionalEnv('DATABASE_URL');
  if (!url) throw new Error('DATABASE_URL is not set in the Vercel project settings.');
  const { db } = await prepareDatabase(
    createClient({ url, authToken: optionalEnv('DATABASE_AUTH_TOKEN') }),
  );
  await ensureDemoAccount(db, config);
  const app = await buildApp({
    config,
    db,
    // Static files come from the CDN; the function never serves them.
    clientDir: 'no-client-in-the-function',
    logger: { level: 'warn' },
  });
  await app.ready();
  return app;
}

/**
 * Vercel's request handler: hand the request to Fastify.
 *
 * @param request - the incoming request.
 * @param response - the response to write.
 */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  let app: FastifyInstance;
  try {
    ready ??= start();
    app = await ready;
  } catch (error) {
    // Try again on the next request (the database may have been briefly unreachable).
    ready = undefined;
    // The message names a missing setting or a failed connection; it never holds a secret.
    console.error('OnCurve could not start:', error instanceof Error ? error.message : error);
    response.statusCode = 503;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: 'The server is starting or unavailable. Try again.' }));
    return;
  }
  app.server.emit('request', request, response);
}
