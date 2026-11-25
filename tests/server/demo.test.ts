/**
 * Server tests for the shared demo account on the hosted site: visitors can use it, but
 * cannot change its password, two-factor settings or recovery codes, sign other visitors
 * out, see their browsers, delete it, or lock it with wrong passwords.
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerConfig } from '../../server/config.ts';
import type { Database } from '../../server/db/client.ts';
import {
  DEMO_EMAIL,
  DEMO_LOCKED_MESSAGE,
  DEMO_PASSWORD,
  ensureDemoAccount,
} from '../../server/demo.ts';
import { createTestApp, TEST_CONFIG, TestBrowser } from './helpers.ts';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** An app with the demo account, protected or not, and a visitor signed in to it. */
async function demoVisitor(
  config: Partial<ServerConfig>,
  ip = '198.51.100.40',
): Promise<{ visitor: TestBrowser; db: Database }> {
  const created = await createTestApp(config);
  app = created.app;
  await ensureDemoAccount(created.db, { ...TEST_CONFIG, ...config });
  const visitor = new TestBrowser(app, ip);
  await visitor.start();
  const signIn = await visitor.request('POST', '/api/auth/signin', {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  expect(signIn.json().status).toBe('signed-in');
  return { visitor, db: created.db };
}

describe('the hosted demo account', () => {
  it('is created once, with sample work, and says it is shared', async () => {
    const { visitor, db } = await demoVisitor({ demoLocked: true });
    expect(await ensureDemoAccount(db, { ...TEST_CONFIG, demoLocked: true })).toBeNull();
    expect((await visitor.start()).json().user.sharedDemo).toBe(true);
    expect((await visitor.request('GET', '/api/saved')).json().items.length).toBeGreaterThan(0);
  });

  it('refuses every change to its security, and deleting it', async () => {
    const { visitor } = await demoVisitor({ demoLocked: true });
    const attempts: Array<[string, Record<string, string> | undefined]> = [
      ['/api/auth/password', { currentPassword: DEMO_PASSWORD, newPassword: 'Taken-over-123456' }],
      ['/api/auth/2fa/setup', undefined],
      ['/api/auth/2fa/enable', { code: '123456' }],
      ['/api/auth/2fa/disable', { password: DEMO_PASSWORD, code: '123456' }],
      ['/api/auth/recovery-codes', { password: DEMO_PASSWORD }],
      ['/api/auth/signout-all', undefined],
      ['/api/account/delete', { password: DEMO_PASSWORD }],
    ];
    for (const [url, body] of attempts) {
      const response = await visitor.request('POST', url, body);
      expect(response.statusCode, url).toBe(403);
      expect(response.json().error, url).toBe(DEMO_LOCKED_MESSAGE);
    }
    // Nothing changed: the same password still signs in.
    const other = new TestBrowser(app!, '198.51.100.41');
    await other.start();
    expect(
      (
        await other.request('POST', '/api/auth/signin', {
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
        })
      ).json().status,
    ).toBe('signed-in');
  });

  it('shows each visitor only their own browser, and cannot end another visitor’s', async () => {
    const { visitor } = await demoVisitor({ demoLocked: true });
    const other = new TestBrowser(app!, '198.51.100.42');
    await other.start();
    await other.request('POST', '/api/auth/signin', { email: DEMO_EMAIL, password: DEMO_PASSWORD });

    const mine = (await visitor.request('GET', '/api/account/sessions')).json().sessions;
    expect(mine).toHaveLength(1);
    expect(mine[0].current).toBe(true);
    const theirs = (await other.request('GET', '/api/account/sessions')).json().sessions[0].id;
    const ending = await visitor.request('DELETE', `/api/account/sessions/${theirs}`);
    expect(ending.statusCode).toBe(403);
    // Signing out of one's own browser still works.
    expect(
      (await visitor.request('DELETE', `/api/account/sessions/${mine[0].id}`)).statusCode,
    ).toBe(200);
  });

  it('cannot be locked by someone typing wrong passwords', async () => {
    await demoVisitor({ demoLocked: true });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const guesser = new TestBrowser(app!, `203.0.113.${100 + attempt}`);
      await guesser.start();
      await guesser.request('POST', '/api/auth/signin', {
        email: DEMO_EMAIL,
        password: 'Wrong-password-123',
      });
    }
    const visitor = new TestBrowser(app!, '198.51.100.43');
    await visitor.start();
    const response = await visitor.request('POST', '/api/auth/signin', {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    expect(response.json().status).toBe('signed-in');
  });

  it('cannot have its password reset with a recovery code', async () => {
    await demoVisitor({ demoLocked: true });
    const stranger = new TestBrowser(app!, '198.51.100.44');
    await stranger.start();
    const response = await stranger.request('POST', '/api/auth/recover', {
      email: DEMO_EMAIL,
      recoveryCode: 'AAAAA-BBBBB',
      newPassword: 'Taken-over-123456',
    });
    expect(response.statusCode).toBe(403);
  });

  it('stays an ordinary account on a local copy of the app', async () => {
    const { visitor } = await demoVisitor({ demoLocked: false });
    expect((await visitor.start()).json().user.sharedDemo).toBeUndefined();
    const response = await visitor.request('POST', '/api/auth/recovery-codes', {
      password: DEMO_PASSWORD,
    });
    expect(response.statusCode).toBe(200);
  });
});
