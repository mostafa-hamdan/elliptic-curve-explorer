/**
 * Tests for the password rules shared by the strength meter and the server: weak patterns
 * (repeats, keyboard runs, sequences, common passwords) are refused with a clear reason,
 * while a random password and a passphrase are accepted.
 */
import { describe, expect, it } from 'vitest';
import {
  checkPassword,
  keyboardNeighbors,
  MIN_PASSWORD_SCORE,
  predictablePattern,
} from '@shared/passwordRules.ts';

describe('password rules', () => {
  it('refuses repeats, sequences, keyboard runs and common passwords, rated below Fair', () => {
    for (const password of [
      'aaaaaaaaaaaa',
      'abcdefghijkl',
      'qwertyuiopas',
      'password1234',
      'aaaaaasassdd',
    ]) {
      const check = checkPassword(password, 'student@example.com');
      expect(check.problem, password).not.toBeNull();
      expect(check.score, password).toBeLessThan(MIN_PASSWORD_SCORE);
      expect(['Very weak', 'Weak'], password).toContain(check.label);
    }
  });

  it('explains why "aaaaaasassdd" is weak', () => {
    const check = checkPassword('aaaaaasassdd');
    expect(check.label).toBe('Weak');
    expect(check.problem).toContain('at least Fair is needed');
    expect(check.problem).toContain('only 3 different characters');
  });

  it('accepts a random 12-letter password and a four-word passphrase', () => {
    for (const password of ['kqzvmtxbrlwp', 'tangent chord mirror orbit']) {
      const check = checkPassword(password, 'student@example.com');
      expect(check.problem, password).toBeNull();
      expect(check.score, password).toBeGreaterThanOrEqual(MIN_PASSWORD_SCORE);
    }
  });

  it('accepts many random 12-letter lowercase passwords', () => {
    // A fixed, repeatable "random" sequence (linear congruential generator).
    let state = 12345;
    const letter = () => {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      return String.fromCharCode(97 + (state % 26));
    };
    for (let round = 0; round < 50; round += 1) {
      const password = Array.from({ length: 12 }, letter).join('');
      expect(checkPassword(password).problem, password).toBeNull();
    }
  });

  it('still refuses short passwords and names the length', () => {
    expect(checkPassword('Short-1').problem).toBe('Use at least 12 characters (you have 7).');
  });

  it('recognizes keyboard neighbors and predictable patterns', () => {
    expect(keyboardNeighbors('a', 's')).toBe(true);
    expect(keyboardNeighbors('q', 'a')).toBe(true);
    expect(keyboardNeighbors('a', 'l')).toBe(false);
    expect(predictablePattern('asdfasdfasdf')).not.toBeNull();
    expect(predictablePattern('kqzvmtxbrlwp')).toBeNull();
  });
});
