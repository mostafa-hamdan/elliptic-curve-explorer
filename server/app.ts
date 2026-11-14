/**
 * Builds the web server (Fastify) without starting it.
 * Keeping "build" separate from "listen" lets the tests call routes directly, with no
 * network port involved. The server answers `/api/*` routes and also hands out the built
 * website from `dist/client`, so one command runs the whole app.
 */
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

/** Folder that `npm run build` fills with the website. Works with spaces in the path. */
export const DEFAULT_CLIENT_DIR = fileURLToPath(new URL('../dist/client', import.meta.url));

/** Options for {@link buildApp}. */
export interface BuildAppOptions {
  /** Folder holding the built website. Defaults to `dist/client`. */
  clientDir?: string;
  /** Print one log line per request. Off by default so tests stay quiet. */
  logger?: boolean;
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

/**
 * Create the configured server.
 *
 * @param options - where the built website lives and whether to log requests.
 * @returns a Fastify instance that is ready to `listen()` or to `inject()` test requests.
 * @throws if a plugin fails to register (for example an unreadable website folder).
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const clientDir = options.clientDir ?? DEFAULT_CLIENT_DIR;
  const hasClient = existsSync(clientDir);

  // A tiny route used by the start script and the tests to see that the server is up.
  app.get('/api/health', { schema: { response: { 200: healthResponseSchema } } }, async () => ({
    status: 'ok',
    app: 'oncurve',
  }));

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
