/**
 * Server tests for accounts and security: sign-up rules, sign-in, sessions, CSRF,
 * two-factor authentication, recovery codes, lockout and rate limits, separation between
 * accounts, deleting an account, injection payloads and the security headers.
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activity, history, savedItems, sessions, users } from '../../server/db/schema.ts';
import type { Database } from '../../server/db/client.ts';
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

/** The TOTP secret of an account, read back from the database (tests only). */
async function totpSecretOf(email: string): Promise<string> {
  const row = (await db.select().from(users).where(eq(users.email, email)))[0]!;
  return open(TEST_CONFIG.sessionSecret, (row.totpSecret ?? row.totpPending)!);
}

describe('sign-up', () => {
  it('creates an account, signs in and returns ten recovery codes', async () => {
    const browser = new TestBrowser(app);
    const codes = await browser.signUp('Alice@Example.com');
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);

    const session = (await browser.start()).json();
    expect(session.user).toMatchObject({ email: 'alice@example.com', twoFactor: false });
    expect(session.recoveryCodesLeft).toBe(10);
  });

  it('stores an Argon2id hash, never the password', async () => {
    await new TestBrowser(app).signUp('bob@example.com');
    const row = (await db.select().from(users).where(eq(users.email, 'bob@example.com')))[0]!;
    expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(row.passwordHash).not.toContain(GOOD_PASSWORD);
  });

  it('refuses short, common and weak passwords with a clear reason', async () => {
    const browser = new TestBrowser(app);
    await browser.start();
    const cases: Array<[string, RegExp]> = [
      ['short-pw', /at least 12 characters/],
      ['password1234', /most common passwords/],
      ['aaaaaaaaaaaa', /too easy to guess|most common/],
    ];
    for (const [password, message] of cases) {
      const response = await browser.request('POST', '/api/auth/signup', {
        email: 'c@example.com',
        password,
      });
      expect(response.statusCode, password).toBe(400);
      expect(response.json().error).toMatch(message);
    }
  });

  it('refuses a second account with the same email', async () => {
    await new TestBrowser(app).signUp('dup@example.com');
    const other = new TestBrowser(app, '198.51.100.8');
    await other.start();
    const response = await other.request('POST', '/api/auth/signup', {
      email: 'DUP@example.com',
      password: GOOD_PASSWORD,
    });
    expect(response.statusCode).toBe(409);
  });

  it('refuses malformed input before it reaches the handler', async () => {
    const browser = new TestBrowser(app);
    await browser.start();
    for (const body of [
      { email: 'not-an-email', password: GOOD_PASSWORD },
      { email: 'a@b.co' },
      { email: 'a@b.co', password: GOOD_PASSWORD, admin: true },
      { email: 'a@b.co', password: 'x'.repeat(300) },
    ]) {
      const response = await browser.request('POST', '/api/auth/signup', body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
      expect(response.json().error).toMatch(/not valid/);
    }
  });
});

describe('sign-in and sessions', () => {
  it('signs in, keeps the session, and signs out', async () => {
    await new TestBrowser(app).signUp('eve@example.com');
    const browser = new TestBrowser(app);
    await browser.start();
    const response = await browser.request('POST', '/api/auth/signin', {
      email: 'eve@example.com',
      password: GOOD_PASSWORD,
    });
    expect(response.json()).toMatchObject({
      status: 'signed-in',
      user: { email: 'eve@example.com' },
    });

    const cookie = response.cookies.find((item) => item.name === 'oncurve_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    expect(cookie.secure).toBeFalsy();

    expect((await browser.start()).json().user.email).toBe('eve@example.com');
    await browser.request('POST', '/api/auth/signout');
    expect((await browser.start()).json().user).toBeNull();
  });

  it('gives the same message for an unknown email and a wrong password', async () => {
    await new TestBrowser(app).signUp('frank@example.com');
    const browser = new TestBrowser(app, '198.51.100.20');
    await browser.start();
    const unknown = await browser.request('POST', '/api/auth/signin', {
      email: 'nobody@example.com',
      password: GOOD_PASSWORD,
    });
    const wrong = await browser.request('POST', '/api/auth/signin', {
      email: 'frank@example.com',
      password: 'Wrong-password-123',
    });
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().error).toBe('Wrong email or password.');
    expect(wrong.json().error).toBe('Wrong email or password.');
  });

  it('stores only a hash of the session token, and ends sessions after inactivity', async () => {
    const browser = new TestBrowser(app);
    await browser.signUp('gina@example.com');
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // Pretend the browser has been idle for three hours.
    await db.update(sessions).set({ lastSeenAt: Date.now() - 3 * 60 * 60 * 1000 });
    expect((await browser.start()).json().user).toBeNull();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it('signs out every device', async () => {
    const first = new TestBrowser(app);
    await first.signUp('hank@example.com');
    const second = new TestBrowser(app, '198.51.100.9');
    await second.start();
    await second.request('POST', '/api/auth/signin', {
      email: 'hank@example.com',
      password: GOOD_PASSWORD,
    });
    expect(await db.select().from(sessions)).toHaveLength(2);

    await first.request('POST', '/api/auth/signout-all');
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect((await second.start()).json().user).toBeNull();
  });

  it('lists sessions and ends one remotely', async () => {
    const first = new TestBrowser(app);
    await first.signUp('ivy@example.com');
    const second = new TestBrowser(
      app,
      '198.51.100.10',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/131.0',
    );
    await second.start();
    await second.request('POST', '/api/auth/signin', {
      email: 'ivy@example.com',
      password: GOOD_PASSWORD,
    });

    const list = (await first.request('GET', '/api/account/sessions')).json().sessions;
    expect(list).toHaveLength(2);
    const other = list.find((item: { current: boolean }) => !item.current);
    expect(other.device).toBe('Firefox on macOS');
    await first.request('DELETE', `/api/account/sessions/${other.id}`);
    expect((await second.start()).json().user).toBeNull();
    expect((await first.start()).json().user.email).toBe('ivy@example.com');
  });
});

describe('CSRF protection', () => {
  it('refuses a state-changing request without the token or with a wrong one', async () => {
    const browser = new TestBrowser(app);
    await browser.signUp('jo@example.com');
    const missing = await browser.request('POST', '/api/auth/signout', undefined, { csrf: false });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error).toMatch(/security token/);

    browser.csrfToken = 'forged-token';
    expect((await browser.request('DELETE', '/api/history')).statusCode).toBe(403);
  });

  it('issues a new token at sign-in, so a token from before sign-in stops working', async () => {
    await new TestBrowser(app).signUp('kim@example.com');
    const browser = new TestBrowser(app);
    await browser.start();
    const before = browser.csrfToken;
    await browser.request('POST', '/api/auth/signin', {
      email: 'kim@example.com',
      password: GOOD_PASSWORD,
    });
    expect(browser.csrfToken).not.toBe(before);
    browser.csrfToken = before;
    expect((await browser.request('DELETE', '/api/history')).statusCode).toBe(403);
  });
});

describe('two-factor authentication', () => {
  it('turns on with a code from the app, then asks for a code at sign-in', async () => {
    const browser = new TestBrowser(app);
    await browser.signUp('lee@example.com');
    const setup = (await browser.request('POST', '/api/auth/2fa/setup')).json();
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\/OnCurve:lee%40example.com\?/);
    expect(setup.qrSvg).toContain('<svg');

    const wrong = await browser.request('POST', '/api/auth/2fa/enable', { code: '000000' });
    expect(wrong.statusCode).toBe(400);
    const secret = await totpSecretOf('lee@example.com');
    expect(
      (await browser.request('POST', '/api/auth/2fa/enable', { code: currentTotp(secret) }))
        .statusCode,
    ).toBe(200);
    // The secret is stored encrypted, not as the base32 text.
    const row = (await db.select().from(users).where(eq(users.email, 'lee@example.com')))[0]!;
    expect(row.totpSecret).not.toContain(secret);

    const other = new TestBrowser(app, '198.51.100.11');
    await other.start();
    const first = await other.request('POST', '/api/auth/signin', {
      email: 'lee@example.com',
      password: GOOD_PASSWORD,
    });
    expect(first.json()).toEqual({ status: 'second-factor' });
    expect((await other.start()).json().user).toBeNull();

    const bad = await other.request('POST', '/api/auth/signin', {
      email: 'lee@example.com',
      password: GOOD_PASSWORD,
      code: '123456',
    });
    expect(bad.statusCode).toBe(401);
    // The code that turned 2FA on was already used, so the next one is needed: wait a step.
    const later = currentTotp(secret, Date.now() + 30_000);
    const good = await other.request('POST', '/api/auth/signin', {
      email: 'lee@example.com',
      password: GOOD_PASSWORD,
      code: later,
    });
    expect(good.json().status).toBe('signed-in');
  });

  it('refuses the same code twice', async () => {
    const browser = new TestBrowser(app);
    await browser.signUp('max@example.com');
    await browser.request('POST', '/api/auth/2fa/setup');
    const secret = await totpSecretOf('max@example.com');
    const code = currentTotp(secret);
    await browser.request('POST', '/api/auth/2fa/enable', { code });
    const other = new TestBrowser(app, '198.51.100.12');
    await other.start();
    const replay = await other.request('POST', '/api/auth/signin', {
      email: 'max@example.com',
      password: GOOD_PASSWORD,
      code,
    });
    expect(replay.statusCode).toBe(401);
  });

  it('accepts a recovery code instead of the app, once only', async () => {
    const browser = new TestBrowser(app);
    const codes = await browser.signUp('nia@example.com');
    await browser.request('POST', '/api/auth/2fa/setup');
    await browser.request('POST', '/api/auth/2fa/enable', {
      code: currentTotp(await totpSecretOf('nia@example.com')),
    });

    const other = new TestBrowser(app, '198.51.100.13');
    await other.start();
    const code = codes[0]!.toLowerCase().replace('-', ' ');
    const first = await other.request('POST', '/api/auth/signin', {
      email: 'nia@example.com',
      password: GOOD_PASSWORD,
      code,
    });
    expect(first.json().status).toBe('signed-in');
    other.clear();
    await other.start();
    const again = await other.request('POST', '/api/auth/signin', {
      email: 'nia@example.com',
      password: GOOD_PASSWORD,
      code,
    });
    expect(again.statusCode).toBe(401);
    expect((await browser.start()).json().recoveryCodesLeft).toBe(9);
  });

  it('turns off only with the password and a code', async () => {
    const browser = new TestBrowser(app);
    await browser.signUp('oli@example.com');
    await browser.request('POST', '/api/auth/2fa/setup');
    const secret = await totpSecretOf('oli@example.com');
    await browser.request('POST', '/api/auth/2fa/enable', { code: currentTotp(secret) });
    const noCode = await browser.request('POST', '/api/auth/2fa/disable', {
      password: GOOD_PASSWORD,
      code: '000000',
    });
    expect(noCode.statusCode).toBe(400);
    const ok = await browser.request('POST', '/api/auth/2fa/disable', {
      password: GOOD_PASSWORD,
      code: currentTotp(secret, Date.now() + 30_000),
    });
    expect(ok.statusCode).toBe(200);
    expect((await browser.start()).json().user.twoFactor).toBe(false);
  });
});

describe('lost password', () => {
  it('resets the password with a recovery code and signs out other devices', async () => {
    const owner = new TestBrowser(app);
    const codes = await owner.signUp('pat@example.com');
    const helper = new TestBrowser(app, '198.51.100.14');
    await helper.start();
    const reset = await helper.request('POST', '/api/auth/recover', {
      email: 'pat@example.com',
      recoveryCode: codes[3],
      newPassword: 'Brand-new-curve-secret-41',
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().recoveryCodesLeft).toBe(9);
    expect((await owner.start()).json().user).toBeNull();

    const wrongCode = await helper.request('POST', '/api/auth/recover', {
      email: 'pat@example.com',
      recoveryCode: codes[3],
      newPassword: 'Another-new-curve-secret-42',
    });
    expect(wrongCode.statusCode).toBe(401);
    expect(wrongCode.json().error).toBe('That email and recovery code do not match.');

    const signIn = await new TestBrowser(app, '198.51.100.15').request('GET', '/api/auth/session');
    expect(signIn.statusCode).toBe(200);
  });
});

describe('brute force protection', () => {
  it('locks an account for a while after five wrong passwords, known or not', async () => {
    await new TestBrowser(app).signUp('quinn@example.com');
    for (const email of ['quinn@example.com', 'ghost@example.com']) {
      // Each guess comes from a different address, so only the per-account limit applies.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const browser = new TestBrowser(app, `203.0.113.${attempt + 1}`);
        await browser.start();
        const response = await browser.request('POST', '/api/auth/signin', {
          email,
          password: 'Wrong-password-123',
        });
        expect(response.statusCode).toBe(401);
      }
      const browser = new TestBrowser(app, '203.0.113.99');
      await browser.start();
      const locked = await browser.request('POST', '/api/auth/signin', {
        email,
        password: GOOD_PASSWORD,
      });
      expect(locked.statusCode, email).toBe(429);
      expect(locked.json().error).toMatch(/Too many failed attempts for this account/);
    }
  });

  it('limits sign-in attempts from one network address', async () => {
    const browser = new TestBrowser(app, '203.0.113.200');
    await browser.start();
    let last = 0;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const response = await browser.request('POST', '/api/auth/signin', {
        email: `user${attempt}@example.com`,
        password: 'Wrong-password-123',
      });
      last = response.statusCode;
    }
    expect(last).toBe(429);
  });

  it('limits new accounts per network address', async () => {
    const browser = new TestBrowser(app, '203.0.113.201');
    await browser.start();
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      browser.clear();
      await browser.start();
      const response = await browser.request('POST', '/api/auth/signup', {
        email: `many${index}@example.com`,
        password: GOOD_PASSWORD,
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('separation between accounts', () => {
  it('one account can never see or delete another account’s data', async () => {
    const alice = new TestBrowser(app);
    await alice.signUp('rose@example.com');
    const created = await alice.request('POST', '/api/saved', {
      kind: 'curve',
      name: 'Rose curve',
      data: { p: '23', a: '1', b: '1' },
    });
    const savedId = created.json().id;
    await alice.request('POST', '/api/history', {
      operation: 'add',
      input: { p: '23', a: '1', b: '1' },
      result: '(17, 20)',
    });

    const mallory = new TestBrowser(app, '198.51.100.30');
    await mallory.signUp('sam@example.com');
    expect((await mallory.request('GET', '/api/saved')).json().items).toEqual([]);
    expect((await mallory.request('GET', '/api/history')).json().entries).toEqual([]);
    expect((await mallory.request('DELETE', `/api/saved/${savedId}`)).statusCode).toBe(404);
    expect((await alice.request('GET', '/api/saved')).json().items).toHaveLength(1);

    const aliceSessions = (await alice.request('GET', '/api/account/sessions')).json().sessions;
    expect(
      (await mallory.request('DELETE', `/api/account/sessions/${aliceSessions[0].id}`)).statusCode,
    ).toBe(404);
    expect((await alice.start()).json().user.email).toBe('rose@example.com');
  });

  it('refuses every account route when signed out', async () => {
    const browser = new TestBrowser(app);
    await browser.start();
    for (const [method, url] of [
      ['GET', '/api/saved'],
      ['GET', '/api/history'],
      ['GET', '/api/settings'],
      ['GET', '/api/account/sessions'],
      ['GET', '/api/account/activity'],
      ['POST', '/api/auth/2fa/setup'],
    ] as const) {
      const response = await browser.request(method, url);
      expect(response.statusCode, url).toBe(401);
      expect(response.json().error).toBe('Please sign in first.');
    }
  });
});

describe('deleting an account', () => {
  it('removes every row that belonged to the user', async () => {
    const browser = new TestBrowser(app);
    await browser.signUp('tom@example.com');
    await browser.request('POST', '/api/saved', {
      kind: 'curve',
      name: 'Mine',
      data: { p: '17', a: '2', b: '2' },
    });
    await browser.request('POST', '/api/history', {
      operation: 'points',
      input: { p: '17', a: '2', b: '2' },
      result: '19 points',
    });
    await browser.request('PUT', '/api/settings', { theme: 'dark' });

    const wrong = await browser.request('POST', '/api/account/delete', {
      password: 'Not-the-password-1',
    });
    expect(wrong.statusCode).toBe(400);
    const ok = await browser.request('POST', '/api/account/delete', { password: GOOD_PASSWORD });
    expect(ok.statusCode).toBe(200);

    expect(await db.select().from(users)).toHaveLength(0);
    for (const table of [sessions, savedItems, history, activity]) {
      expect(await db.select().from(table)).toHaveLength(0);
    }
    expect((await browser.start()).json().user).toBeNull();
  });
});

describe('hostile input', () => {
  it('treats SQL and script payloads as plain text', async () => {
    const browser = new TestBrowser(app);
    await browser.start();
    // With spaces it is not even a valid email, so the schema refuses it (400) …
    const spaced = await browser.request('POST', '/api/auth/signin', {
      email: "x@x.co' OR '1'='1",
      password: "' OR 1=1; DROP TABLE users; --",
    });
    expect(spaced.statusCode).toBe(400);
    // … and without spaces it reaches the query as a plain value and matches nobody (401).
    const packed = await browser.request('POST', '/api/auth/signin', {
      email: "x@x.co'OR'1'='1",
      password: "'OR'1'='1'--",
    });
    expect(packed.statusCode).toBe(401);
    expect(packed.json().error).toBe('Wrong email or password.');

    await browser.signUp('uma@example.com');
    const script = '<script>alert(1)</script>';
    await browser.request('POST', '/api/saved', {
      kind: 'curve',
      name: script,
      data: { p: '23', a: '1', b: '1' },
    });
    const items = (await browser.request('GET', '/api/saved')).json().items;
    // Stored and returned as text; the page shows it as text (React escapes it).
    expect(items[0].name).toBe(script);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it('refuses saved curves and points that the engine rejects', async () => {
    const browser = new TestBrowser(app);
    await browser.signUp('val@example.com');
    const cases = [
      { kind: 'curve', name: 'Not prime', data: { p: '21', a: '1', b: '1' } },
      { kind: 'curve', name: 'Singular', data: { p: '23', a: '0', b: '0' } },
      { kind: 'point', name: 'Off the curve', data: { p: '23', a: '1', b: '1', x: '3', y: '11' } },
      { kind: 'curve', name: 'Letters', data: { p: 'abc', a: '1', b: '1' } },
    ];
    for (const body of cases) {
      const response = await browser.request('POST', '/api/saved', body);
      expect(response.statusCode, body.name).toBe(400);
    }
  });
});

describe('security headers', () => {
  it('sends CSP, frame blocking, no-sniff and a strict referrer policy; HSTS only when hosted', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['strict-transport-security']).toBeUndefined();

    const hosted = await createTestApp({ hosted: true });
    const hostedResponse = await hosted.app.inject({ method: 'GET', url: '/api/health' });
    expect(hostedResponse.headers['strict-transport-security']).toContain('max-age=31536000');
    await hosted.app.close();
  });

  it('marks cookies Secure when hosted', async () => {
    const hosted = await createTestApp({ hosted: true });
    const browser = new TestBrowser(hosted.app);
    const response = await browser.start();
    expect(response.cookies.find((cookie) => cookie.name === 'oncurve_csrf')?.secure).toBe(true);
    await hosted.app.close();
  });
});
