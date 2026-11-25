/**
 * Build for Vercel, in Vercel's "Build Output API" format (.vercel/output):
 *   static/            the website, served by Vercel's CDN
 *   functions/api.func the server (server/vercel.ts) bundled into one file, plus the
 *                      database migrations and the one native package (Argon2)
 *   config.json        the routes: security headers on every answer, /api/* to the
 *                      function, every other unknown address to the website's index.html
 * Vercel runs this as the build command (see vercel.json). It also works locally, to
 * check the output, but the native Argon2 package it copies is the one for this computer.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** The project folder; works with spaces in the path. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = `${ROOT}.vercel/output`;
const FUNCTION = `${OUTPUT}/functions/api.func`;

/** Packages with native code: copied as they are instead of bundled. */
const NATIVE_PACKAGES = ['@node-rs/argon2'];

/**
 * The security headers the server sends, read from the server itself so the static files
 * get exactly the same Content-Security-Policy and friends as the API.
 *
 * @returns header names and values.
 */
async function securityHeaders() {
  const { buildApp } = await import('../server/app.ts');
  const { prepareDatabase } = await import('../server/db/prepare.ts');
  const { createClient } = await import('@libsql/client');
  const { db, client } = await prepareDatabase(createClient({ url: ':memory:' }));
  const app = await buildApp({
    config: {
      sessionSecret: 'build-time-only-secret-build-time-only-secret',
      hosted: true,
      aiProvider: null,
      anthropicApiKey: undefined,
      openaiApiKey: undefined,
      openaiModel: 'none',
      openaiReasoningEffort: null,
      aiDailyLimit: 0,
      demoLocked: true,
      signupsPerHour: 1,
      signinsPerWindow: 1,
    },
    db,
    clientDir: 'none',
  });
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  await app.close();
  client.close();
  const wanted =
    /^(content-security-policy|cross-origin-|origin-agent-cluster|referrer-policy|strict-transport-security|x-content-type-options|x-dns-prefetch-control|x-download-options|x-frame-options|x-permitted-cross-domain-policies|x-xss-protection)/;
  return Object.fromEntries(
    Object.entries(response.headers)
      .filter(([name]) => wanted.test(name))
      .map(([name, value]) => [name, String(value)]),
  );
}

/** Run a command in the project folder and stop the build if it fails. */
function run(command) {
  const result = spawnSync(command, { cwd: ROOT, shell: true, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`"${command}" failed.`);
}

rmSync(OUTPUT, { recursive: true, force: true });
mkdirSync(FUNCTION, { recursive: true });

console.info('Building the website...');
run('npm run build');
cpSync(`${ROOT}dist/client`, `${OUTPUT}/static`, { recursive: true });

console.info('Bundling the server function...');
await build({
  entryPoints: [`${ROOT}server/vercel.ts`],
  outfile: `${FUNCTION}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: NATIVE_PACKAGES,
  // Some bundled packages still call require(); give the bundle one.
  banner: {
    js: "import { createRequire as oncurveRequire } from 'node:module'; const require = oncurveRequire(import.meta.url);",
  },
  legalComments: 'none',
  logLevel: 'warning',
});

// The migrations are read at start-up from next to the bundle.
cpSync(`${ROOT}server/db/migrations`, `${FUNCTION}/migrations`, { recursive: true });

// Native packages, with the binary built for this machine (Linux on Vercel).
for (const name of NATIVE_PACKAGES) {
  const [scope, base] = name.split('/');
  const scopeDir = `${ROOT}node_modules/${scope}`;
  for (const entry of readdirSync(scopeDir)) {
    if (entry === base || entry.startsWith(`${base}-`)) {
      cpSync(`${scopeDir}/${entry}`, `${FUNCTION}/node_modules/${scope}/${entry}`, {
        recursive: true,
      });
    }
  }
}

writeFileSync(
  `${FUNCTION}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      // Fastify reads the request body itself.
      shouldAddHelpers: false,
      maxDuration: 60,
    },
    null,
    2,
  ),
);

const headers = await securityHeaders();
writeFileSync(
  `${OUTPUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        // The same security headers as the server sends, on every answer.
        { src: '/(.*)', headers, continue: true },
        // Built files have a content hash in their name, so they never change.
        {
          src: '/assets/(.*)',
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
          continue: true,
        },
        { src: '/api', dest: '/api' },
        { src: '/api/(.*)', dest: '/api' },
        { handle: 'filesystem' },
        // Addresses such as /explorer and /learn/point-addition are pages of the website.
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

if (!existsSync(`${FUNCTION}/index.mjs`)) throw new Error('The function bundle is missing.');
console.info('Vercel output is ready in .vercel/output');
