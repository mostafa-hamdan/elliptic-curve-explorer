/**
 * Tests for the save a guest parks while signing in (client/src/features/account/
 * pendingSave.ts): it round-trips, expires, refuses addresses outside the site and
 * survives damaged or blocked storage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_SAVE_MAX_AGE_MS,
  clearPendingSave,
  pathAfterSignIn,
  readPendingSave,
  storePendingSave,
} from '../../client/src/features/account/pendingSave.ts';

/** A minimal stand-in for the browser's session storage. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

const CURVE = { kind: 'curve' as const, name: 'E17(2, 2)', data: { p: '17', a: '2', b: '2' } };

describe('parked save', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('window', { sessionStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('round-trips and decides where to go after signing in', () => {
    expect(pathAfterSignIn('/account')).toBe('/account');
    storePendingSave({ ...CURVE, returnTo: '/explorer' });
    expect(readPendingSave()).toMatchObject({ ...CURVE, returnTo: '/explorer' });
    expect(pathAfterSignIn('/account')).toBe('/explorer');
    clearPendingSave();
    expect(readPendingSave()).toBeNull();
    expect(pathAfterSignIn('/account')).toBe('/account');
  });

  it('is dropped once it is too old', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
    storePendingSave({ ...CURVE, returnTo: '/explorer' });
    vi.setSystemTime(Date.now() + PENDING_SAVE_MAX_AGE_MS + 1);
    expect(readPendingSave()).toBeNull();
    // And it is removed, not just ignored.
    expect(storage.length).toBe(0);
  });

  it('never sends the user to another site', () => {
    for (const returnTo of ['//evil.example', 'https://evil.example/', 'explorer', '']) {
      storePendingSave({ ...CURVE, returnTo });
      expect(readPendingSave(), returnTo).toBeNull();
      expect(pathAfterSignIn('/account')).toBe('/account');
    }
  });

  it('ignores damaged values', () => {
    storage.setItem('oncurve.pendingSave', '{not json');
    expect(readPendingSave()).toBeNull();
    storage.setItem(
      'oncurve.pendingSave',
      JSON.stringify({ kind: 'script', name: 'x', data: {}, returnTo: '/', createdAt: Date.now() }),
    );
    expect(readPendingSave()).toBeNull();
  });

  it('works without storage at all', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('blocked');
      },
    });
    expect(() => storePendingSave({ ...CURVE, returnTo: '/explorer' })).not.toThrow();
    expect(readPendingSave()).toBeNull();
    expect(() => clearPendingSave()).not.toThrow();
    expect(pathAfterSignIn('/account')).toBe('/account');
  });
});
