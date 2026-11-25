/**
 * Server tests for sensitive actions: with two-factor authentication on, changing the
 * password, turning 2FA off, making new recovery codes and deleting the account all need a
 * current authenticator code or a recovery code, and wrong attempts are limited. Also
 * checks that the security log records every security change, and that lockouts and rate
 * limits work the same when the website asks for its "normal answer" refusals.
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CODE_NEEDED, CONFIRM_FAILURES_ALLOWED } from '../../server/auth/confirm.ts';
import type { Database } from '../../server/db/client.ts';
import { users } from '../../server/db/schema.ts';
import { open } from '../../server/security/crypto.ts';
import { currentTotp } from '../../server/security/totp.ts';
import { createTestApp, GOOD_PASSWORD, TEST_CONFIG, TestBrowser } from './helpers.ts';

let app: FastifyInstance;
let db: Database;

beforeEach(async () => {
  ({ app, db } = await createTestApp());
});

afterEach(async () => {
  await app.close();
});

/** An account with 2FA on, its authenticator secret and its ten recovery codes. */
async function accountWithTwoFactor(email: string) {
  const browser = new TestBrowser(app);
  const codes = await browser.signUp(email);
  await browser.request('POST', '/api/auth/2fa/setup');
  const row = (await db.select().from(users).where(eq(users.email, email)))[0]!;
  const secret = open(TEST_CONFIG.sessionSecret, row.totpPending!);
  const enabled = await browser.request('POST', '/api/auth/2fa/enable', {
    code: currentTotp(secret),
  });
  expect(enabled.statusCode).toBe(200);
  return { browser, secret, codes };
}

const NEW_PASSWORD = 'Another-strong-secret-55';

/** The four sensitive actions, each as a request body maker. */
const ACTIONS: Array<[string, string, (code?: string) => Record<string, string>]> = [
  [
    'changing the password',
    '/api/auth/password',
    (code) => ({
      currentPassword: GOOD_PASSWORD,
      newPassword: NEW_PASSWORD,
      ...(code ? { code } : {}),
    }),
  ],
  [
    'turning 2FA off',
    '/api/auth/2fa/disable',
    (code) => ({ password: GOOD_PASSWORD, ...(code ? { code } : {}) }),
  ],
  [
    'making new recovery codes',
    '/api/auth/recovery-codes',
    (code) => ({ password: GOOD_PASSWORD, ...(code ? { code } : {}) }),
  ],
  [
    'deleting the account',
    '/api/account/delete',
    (code) => ({ password: GOOD_PASSWORD, ...(code ? { code } : {}) }),
  ],
];

describe('with two-factor authentication on', () => {
  for (const [name, url, body] of ACTIONS) {
    it(`${name} needs a code, refuses a wrong one, and accepts a recovery code`, async () => {
      const { browser, codes } = await accountWithTwoFactor(
        `${url.length}-${name.length}@example.com`,
      );

      // No code at all: the answer says what is missing.
      const missing = await browser.request('POST', url, body());
      expect(missing.statusCode).toBe(400);
      expect(missing.json().error).toBe(CODE_NEEDED);

      const wrong = await browser.request('POST', url, body('000000'));
      expect(wrong.statusCode).toBe(400);
      expect(wrong.json().error).toMatch(/code is not right/);

      const ok = await browser.request('POST', url, body(codes[0]!));
      expect(ok.statusCode).toBe(200);

      // A recovery code works once only.
      if (url !== '/api/account/delete' && url !== '/api/auth/2fa/disable') {
        const again = await browser.request('POST', url, body(codes[0]!));
        expect(again.statusCode).toBe(400);
      }
    });
  }

  it('accepts the current authenticator code, once', async () => {
    const { browser, secret } = await accountWithTwoFactor('totp@example.com');
    const code = currentTotp(secret, Date.now() + 30_000);
    const first = await browser.request('POST', '/api/auth/recovery-codes', {
      password: GOOD_PASSWORD,
      code,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().recoveryCodes).toHaveLength(10);
    const replay = await browser.request('POST', '/api/auth/recovery-codes', {
      password: GOOD_PASSWORD,
      code,
    });
    expect(replay.statusCode).toBe(400);
  });

  it('still needs the right password, even with a good code', async () => {
    const { browser, codes } = await accountWithTwoFactor('pw@example.com');
    const response = await browser.request('POST', '/api/auth/password', {
      currentPassword: 'Not-the-password-123',
      newPassword: NEW_PASSWORD,
      code: codes[1]!,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Your current password is not right.');
  });

  it(`stops guessing after ${CONFIRM_FAILURES_ALLOWED} wrong attempts`, async () => {
    const { browser, codes } = await accountWithTwoFactor('guess@example.com');
    for (let attempt = 0; attempt < CONFIRM_FAILURES_ALLOWED; attempt += 1) {
      const wrong = await browser.request('POST', '/api/auth/recovery-codes', {
        password: GOOD_PASSWORD,
        code: `${100000 + attempt}`,
      });
      expect(wrong.statusCode).toBe(400);
    }
    // Even the right code is refused while the account is cooling down.
    const blocked = await browser.request('POST', '/api/auth/recovery-codes', {
      password: GOOD_PASSWORD,
      code: codes[2]!,
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toMatch(/Too many wrong attempts/);
  });
});

describe('with two-factor authentication off', () => {
  it('the password is enough', async () => {
    const browser = new TestBrowser(app);
    await browser.signUp('plain@example.com');
    const response = await browser.request('POST', '/api/auth/recovery-codes', {
      password: GOOD_PASSWORD,
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('the security log', () => {
  it('records every security change, not only sign-ins', async () => {
    const { browser, codes, secret } = await accountWithTwoFactor('log@example.com');
    await browser.request('POST', '/api/auth/password', {
      currentPassword: GOOD_PASSWORD,
      newPassword: NEW_PASSWORD,
      code: codes[0]!,
    });
    const renewed = await browser.request('POST', '/api/auth/recovery-codes', {
      password: NEW_PASSWORD,
      code: currentTotp(secret, Date.now() + 30_000),
    });
    const newCodes = renewed.json().recoveryCodes as string[];
    // codes[1] belonged to the old set, which the new codes replaced.
    const old = await browser.request('POST', '/api/auth/2fa/disable', {
      password: NEW_PASSWORD,
      code: codes[1]!,
    });
    expect(old.statusCode).toBe(400);
    const off = await browser.request('POST', '/api/auth/2fa/disable', {
      password: NEW_PASSWORD,
      code: newCodes[0]!,
    });
    expect(off.statusCode).toBe(200);
    await browser.request('POST', '/api/auth/signout-all');
    await browser.start();
    const signedIn = await browser.request('POST', '/api/auth/signin', {
      email: 'log@example.com',
      password: NEW_PASSWORD,
    });
    expect(signedIn.json().status).toBe('signed-in');
    const events = (await browser.request('GET', '/api/account/activity'))
      .json()
      .activity.map((row: { event: string }) => row.event);
    for (const event of [
      'Two-factor authentication turned on',
      'Password changed',
      'New recovery codes created',
      'Two-factor authentication turned off',
      'Signed out of all devices',
    ]) {
      expect(events, event).toContain(event);
    }
  });
});

describe('the website’s "normal answer" refusals', () => {
  it('lock an account after five wrong passwords, exactly like API clients', async () => {
    for (const web of [false, true]) {
      const email = `lock-${web}@example.com`;
      const owner = new TestBrowser(app, '203.0.113.9');
      await owner.signUp(email);
      const attacker = new TestBrowser(app, web ? '203.0.113.10' : '203.0.113.11');
      attacker.web = web;
      await attacker.start();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const wrong = await attacker.request('POST', '/api/auth/signin', {
          email,
          password: 'Wrong-password-123',
        });
        // The website gets 200 with the real status in a header; API clients get the 401.
        expect(wrong.statusCode).toBe(web ? 200 : 401);
        if (web) expect(wrong.headers['x-oncurve-status']).toBe('401');
      }
      const locked = await attacker.request('POST', '/api/auth/signin', {
        email,
        password: GOOD_PASSWORD,
      });
      expect(locked.statusCode).toBe(web ? 200 : 429);
      expect(locked.json().error).toMatch(/Too many|locked/i);
      if (web) expect(locked.headers['x-oncurve-status']).toBe('429');
    }
  });

  it('count against the per-address sign-in limit, exactly like API clients', async () => {
    ({ app, db } = await createTestApp({ signinsPerWindow: 3 }));
    for (const web of [false, true]) {
      const visitor = new TestBrowser(app, web ? '198.51.100.20' : '198.51.100.21');
      visitor.web = web;
      await visitor.start();
      const statuses: string[] = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await visitor.request('POST', '/api/auth/signin', {
          email: `nobody-${attempt}@example.com`,
          password: 'Wrong-password-123',
        });
        statuses.push(String(response.headers['x-oncurve-status'] ?? response.statusCode));
      }
      expect(statuses).toEqual(['401', '401', '401', '429']);
    }
  });
});
