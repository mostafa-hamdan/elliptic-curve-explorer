/**
 * Test helpers for the server: a fresh app with its own in-memory database for every
 * test file, and a tiny "browser" that keeps cookies between requests and sends the CSRF
 * token the way the real page does.
 */
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../server/app.ts';
import type { ServerConfig } from '../../server/config.ts';
import { openDatabase, type Database } from '../../server/db/client.ts';

/** Settings used by every server test. */
export const TEST_CONFIG: ServerConfig = {
  sessionSecret: 'test-secret-that-is-long-enough-for-the-server-checks',
  hosted: false,
  anthropicApiKey: undefined,
  signupsPerHour: 10,
  signinsPerWindow: 30,
};

/** A password that passes every rule. */
export const GOOD_PASSWORD = 'Tangent-chord-reflect-97';

/**
 * Build an app on a brand-new in-memory database.
 *
 * @param config - settings to use instead of the defaults.
 * @returns the app and its database.
 */
export async function createTestApp(
  config: Partial<ServerConfig> = {},
): Promise<{ app: FastifyInstance; db: Database }> {
  const { db } = await openDatabase(':memory:');
  const app = await buildApp({
    config: { ...TEST_CONFIG, ...config },
    db,
    clientDir: 'folder-that-does-not-exist',
  });
  return { app, db };
}

/** A pretend browser: remembers cookies and the CSRF token, like the real website. */
export class TestBrowser {
  private cookies = new Map<string, string>();
  csrfToken = '';

  constructor(
    private readonly app: FastifyInstance,
    /** Network address the requests come from, to test per-address limits. */
    readonly ip = '198.51.100.7',
    readonly userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36',
  ) {}

  /** The cookie header to send. */
  private cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  /** Remember (or forget) the cookies the server set. */
  private keepCookies(response: LightMyRequestResponse): void {
    for (const cookie of response.cookies as Array<{
      name: string;
      value: string;
      maxAge?: number;
    }>) {
      if (cookie.value === '' || cookie.maxAge === 0) this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
  }

  /**
   * Send a request.
   *
   * @param method - HTTP method.
   * @param url - path.
   * @param body - JSON body, if any.
   * @param options - `csrf: false` leaves the CSRF header out.
   * @returns the response.
   */
  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown,
    options: { csrf?: boolean } = {},
  ): Promise<LightMyRequestResponse> {
    const headers: Record<string, string> = {
      'user-agent': this.userAgent,
      cookie: this.cookieHeader(),
    };
    if (options.csrf !== false && method !== 'GET') headers['x-csrf-token'] = this.csrfToken;
    const response = await this.app.inject({
      method,
      url,
      headers,
      remoteAddress: this.ip,
      ...(body === undefined ? {} : { payload: body as object }),
    });
    this.keepCookies(response);
    const json = response.headers['content-type']?.toString().includes('json')
      ? (response.json() as { csrfToken?: string })
      : {};
    if (json.csrfToken) this.csrfToken = json.csrfToken;
    return response;
  }

  /** Load the session the way the page does on start-up (also gets the CSRF token). */
  async start(): Promise<LightMyRequestResponse> {
    return this.request('GET', '/api/auth/session');
  }

  /** Create an account and stay signed in. */
  async signUp(email: string, password = GOOD_PASSWORD): Promise<string[]> {
    await this.start();
    const response = await this.request('POST', '/api/auth/signup', { email, password });
    if (response.statusCode !== 201) throw new Error(`Sign-up failed: ${response.body}`);
    return (response.json() as { recoveryCodes: string[] }).recoveryCodes;
  }

  /** Forget every cookie, like closing a private window. */
  clear(): void {
    this.cookies.clear();
    this.csrfToken = '';
  }
}
