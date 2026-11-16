/**
 * Server tests for a user's own data: saved curves and points, the history (with its size
 * limit), settings (merged, with only known values accepted) and the AI-mode status.
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { history } from '../../server/db/schema.ts';
import type { Database } from '../../server/db/client.ts';
import { createTestApp, TestBrowser } from './helpers.ts';

let app: FastifyInstance;
let db: Database;
let browser: TestBrowser;

beforeEach(async () => {
  ({ app, db } = await createTestApp());
  browser = new TestBrowser(app);
  await browser.signUp('data@example.com');
});

afterEach(async () => {
  await app.close();
});

describe('saved curves and points', () => {
  it('saves, lists newest first and deletes', async () => {
    await browser.request('POST', '/api/saved', {
      kind: 'curve',
      name: 'Class curve',
      data: { p: '23', a: '1', b: '1' },
    });
    const point = await browser.request('POST', '/api/saved', {
      kind: 'point',
      name: 'P from class',
      data: { p: '23', a: '1', b: '1', x: '3', y: '10' },
    });
    expect(point.statusCode).toBe(201);
    const items = (await browser.request('GET', '/api/saved')).json().items;
    expect(items.map((item: { name: string }) => item.name)).toEqual([
      'P from class',
      'Class curve',
    ]);
    expect(items[0].data).toEqual({ p: '23', a: '1', b: '1', x: '3', y: '10' });

    expect((await browser.request('DELETE', `/api/saved/${point.json().id}`)).statusCode).toBe(200);
    expect((await browser.request('GET', '/api/saved')).json().items).toHaveLength(1);
  });

  it('accepts 256-bit curves in hexadecimal', async () => {
    const response = await browser.request('POST', '/api/saved', {
      kind: 'curve',
      name: 'secp256k1',
      data: {
        p: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F',
        a: '0',
        b: '7',
      },
    });
    expect(response.statusCode).toBe(201);
  });

  it('refuses an empty name and a point without coordinates', async () => {
    expect(
      (
        await browser.request('POST', '/api/saved', {
          kind: 'curve',
          name: '   ',
          data: { p: '23', a: '1', b: '1' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await browser.request('POST', '/api/saved', {
          kind: 'point',
          name: 'P',
          data: { p: '23', a: '1', b: '1' },
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('history', () => {
  it('records calculations, lists them newest first and clears them', async () => {
    await browser.request('POST', '/api/history', {
      operation: 'points',
      input: { p: '23', a: '1', b: '1' },
      result: '28 points',
    });
    await browser.request('POST', '/api/history', {
      operation: 'add',
      input: {
        p: '23',
        a: '1',
        b: '1',
        px: '3',
        py: '10',
        qx: '9',
        qy: '7',
        pInfinity: false,
        qInfinity: false,
      },
      result: '(17, 20)',
    });
    const entries = (await browser.request('GET', '/api/history')).json().entries;
    expect(entries.map((entry: { result: string }) => entry.result)).toEqual([
      '(17, 20)',
      '28 points',
    ]);
    expect(entries[0].input.px).toBe('3');

    await browser.request('DELETE', '/api/history');
    expect((await browser.request('GET', '/api/history')).json().entries).toEqual([]);
  });

  it('keeps only the newest 200 entries', async () => {
    const userRow = (await db.select().from(history)).length;
    expect(userRow).toBe(0);
    for (let index = 0; index < 205; index += 1) {
      await browser.request('POST', '/api/history', {
        operation: 'multiply',
        input: { p: '17', a: '2', b: '2', px: '5', py: '1', k: String(index) },
        result: `entry ${index}`,
      });
    }
    const rows = await db.select().from(history);
    expect(rows.length).toBeLessThanOrEqual(200);
    const entries = (await browser.request('GET', '/api/history')).json().entries;
    expect(entries[0].result).toBe('entry 204');
  });

  it('refuses unknown operations and unknown input fields', async () => {
    expect(
      (
        await browser.request('POST', '/api/history', {
          operation: 'hack',
          input: { p: '1', a: '1', b: '1' },
          result: 'x',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await browser.request('POST', '/api/history', {
          operation: 'add',
          input: { p: '1', a: '1', b: '1', evil: 'x' },
          result: 'x',
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('settings', () => {
  it('merges updates and accepts only known values', async () => {
    expect((await browser.request('GET', '/api/settings')).json().settings).toEqual({});
    await browser.request('PUT', '/api/settings', { theme: 'dark' });
    await browser.request('PUT', '/api/settings', {
      textSize: 'large',
      practice: { attempted: 4, solved: 3 },
    });
    expect((await browser.request('GET', '/api/settings')).json().settings).toEqual({
      theme: 'dark',
      textSize: 'large',
      practice: { attempted: 4, solved: 3 },
    });
    expect((await browser.request('PUT', '/api/settings', { theme: 'purple' })).statusCode).toBe(
      400,
    );
    expect((await browser.request('PUT', '/api/settings', { isAdmin: true })).statusCode).toBe(400);
  });
});

describe('assistant status', () => {
  it('reports the offline helper when no key is set', async () => {
    expect((await browser.request('GET', '/api/assistant/status')).json()).toEqual({
      ai: false,
      reason: 'AI mode is not set up on this server.',
    });
  });

  it('asks guests to sign in when a key is set', async () => {
    const keyed = await createTestApp({ anthropicApiKey: 'test-key' });
    const guest = new TestBrowser(keyed.app);
    expect((await guest.request('GET', '/api/assistant/status')).json().reason).toBe(
      'Sign in to use AI mode.',
    );
    await guest.signUp('ai@example.com');
    expect((await guest.request('GET', '/api/assistant/status')).json().ai).toBe(true);
    await keyed.app.close();
  });
});
