/**
 * Builds the web server (Fastify) without starting it.
 * Keeping "build" separate from "listen" lets the tests call routes directly, with no
 * network port involved. The server answers the `/api/*` routes, adds the security headers
 * to every response, and hands out the built website from `dist/client`, so one command
 * runs the whole app.
 */
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Anthropic from '@anthropic-ai/sdk';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { AssistantClient } from './assistant/run.ts';
import { csrfIsValid, loadAuth } from './auth/sessions.ts';
import type { ServerConfig } from './config.ts';
import type { Database } from './db/client.ts';
import { accountRoutes } from './routes/account.ts';
import { assistantRoutes } from './routes/assistant.ts';
import { authRoutes } from './routes/auth.ts';
import { dataRoutes } from './routes/data.ts';
import './routes/shared.ts';

/** Folder that `npm run build` fills with the website. Works with spaces in the path. */
export const DEFAULT_CLIENT_DIR = fileURLToPath(new URL('../dist/client', import.meta.url));

/** Options for {@link buildApp}. */
export interface BuildAppOptions {
  /** The server settings (secret, hosted or local). */
  config: ServerConfig;
  /** The open database. */
  db: Database;
  /** Folder holding the built website. Defaults to `dist/client`. */
  clientDir?: string;
  /** Print one log line per request. Off by default so tests stay quiet. */
  logger?: boolean;
  /** AI client to use instead of the real one (tests pass a stand-in). */
  aiClient?: AssistantClient | null;
}

/** JSON shape of the health reply, enforced by Fastify on the way out. */
const healthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    app: { type: 'string' },
  },
  required: ['status', 'app'],
  additionalProperties: false,
} as const;

/** Methods that only read; every other method must carry the CSRF token. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Create the configured server.
 *
 * @param options - settings, database, where the built website lives, logging.
 * @returns a Fastify instance that is ready to `listen()` or to `inject()` test requests.
 * @throws if a plugin fails to register (for example an unreadable website folder).
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const app = Fastify({
    logger: options.logger ?? false,
    // Behind a hosting platform's proxy the visitor's address is in X-Forwarded-For.
    trustProxy: config.hosted,
    // No request body the app expects is anywhere near this size.
    bodyLimit: 64 * 1024,
    // Refuse unknown fields instead of quietly dropping them (Fastify's default), so a
    // request like { "admin": true } is rejected outright.
    ajv: { customOptions: { removeAdditional: false } },
  });
  const clientDir = options.clientDir ?? DEFAULT_CLIENT_DIR;
  const hasClient = existsSync(clientDir);

  // The AI client exists only when a key is set; the key never leaves the server.
  const ai =
    options.aiClient !== undefined
      ? options.aiClient
      : config.anthropicApiKey
        ? new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 1, timeout: 60_000 })
        : null;
  app.decorate('ctx', { db, config, ai });
  app.decorateRequest('auth', null);
  await app.register(fastifyCookie);

  // Security headers on every response. The Content-Security-Policy allows only this
  // site's own files: no inline scripts, nothing from other sites. QR codes are data: images.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.hosted ? [] : null,
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    // HTTPS-only for a year, but only when hosted: a local demo runs on plain http.
    strictTransportSecurity: config.hosted
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
  });

  // Every request that changes something must prove it comes from this site's own page.
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') || SAFE_METHODS.has(request.method)) return;
    if (!csrfIsValid(request)) {
      return reply.code(403).send({
        error:
          'The page’s security token is missing or out of date. Reload the page and try again.',
      });
    }
  });

  // Find out who is signed in, once per API request.
  app.addHook('preHandler', async (request) => {
    if (request.url.startsWith('/api/')) request.auth = await loadAuth(db, config, request);
  });

  // Browsers print every 4xx answer to fetch() as a red "Failed to load resource" error in
  // the developer console, even when it is an expected outcome such as a wrong password.
  // For the website's own requests (marked with X-OnCurve-Client) such refusals are sent
  // as 200 with the real status in X-OnCurve-Status; the body still carries the message.
  // Every other client, and every test of the API, sees the true status code.
  app.addHook('onSend', async (request, reply, payload) => {
    const status = reply.statusCode;
    if (request.headers['x-oncurve-client'] === 'web' && status >= 400 && status < 500) {
      reply.header('x-oncurve-status', String(status));
      reply.code(200);
    }
    return payload;
  });

  // Bad input gets a clear 400; anything unexpected is logged and answered without details.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        error: 'Some of the information sent was not valid. Check the form and try again.',
      });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'Something went wrong on the server. Please try again.' });
  });

  // A tiny route used by the start script and the tests to see that the server is up.
  app.get('/api/health', { schema: { response: { 200: healthResponseSchema } } }, async () => ({
    status: 'ok',
    app: 'oncurve',
  }));

  await authRoutes(app);
  await accountRoutes(app);
  await dataRoutes(app);
  await assistantRoutes(app);

  if (hasClient) {
    await app.register(fastifyStatic, { root: clientDir });
  }

  // Anything that is not a file or an API route is a page inside the single-page website
  // (for example /limitations), so the browser gets index.html and the website's own
  // router shows the right page. Unknown API routes and missing files stay a real 404.
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    const isPage = request.method === 'GET' && !path.startsWith('/api/') && extname(path) === '';
    if (hasClient && isPage) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
