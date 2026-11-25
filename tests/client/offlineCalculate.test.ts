/**
 * Tests for the calculations the offline helper does by itself with the engine: adding,
 * doubling, multiplying and "is this point on the curve?", with the curve written in the
 * question or taken from the Explorer. The expected values are the class answers.
 */
import { describe, expect, it } from 'vitest';
import { createCurve } from '@shared/ecc/index.ts';
import { answerCalculation } from '../../client/src/features/assistant/calculate.ts';
import {
  answerOffline,
  type HelperContext,
} from '../../client/src/features/assistant/offlineHelper.ts';

const E23 = createCurve(23n, 1n, 1n);
const E17 = createCurve(17n, 2n, 2n);

/** Nothing set up in the Explorer. */
const NONE: HelperContext = {
  curve: null,
  add: null,
  multiply: null,
  points: null,
  lastResult: null,
  tab: 'points',
};

describe('offline calculations', () => {
  it('answers the question that used to be called off-topic', () => {
    const answer = answerOffline('What is (3, 10) + (9, 7) on E23(1, 1)?', NONE);
    expect(answer.source).toBe('compute');
    expect(answer.text).toContain('**(3, 10) + (9, 7) = (17, 20)** on E23(1, 1).');
    // The hand-method steps, with the class numbers.
    expect(answer.text).toContain('6⁻¹ ≡ 4');
    expect(answer.text).toContain('λ = 20 · 4 = 80 ≡ 11');
    expect(answer.text).toContain('x₃ = λ² − x₁ − x₂ = 121 − 3 − 9 = 109 ≡ 17');
  });

  it('doubles a point, written several ways', () => {
    for (const question of [
      'double (3, 10) on E23(1, 1)',
      'What is 2(3, 10) on E₂₃(1, 1)?',
      '2 * (3,10) on e23(1,1)',
      'what is 2·(3, 10) for p = 23, a = 1, b = 1',
    ]) {
      expect(answerCalculation(question, NONE)?.text, question).toContain(
        '**2 · (3, 10) = (7, 12)**',
      );
    }
  });

  it('multiplies with double-and-add', () => {
    const answer = answerCalculation('13 · (5, 1) on E17(2, 2)', NONE)!.text;
    expect(answer).toContain('**13 · (5, 1) = (16, 4)** on E17(2, 2).');
    expect(answer).toContain('k = 1101₂');
    expect(answerCalculation('multiply (5, 1) by 19 on E17(2, 2)', NONE)!.text).toContain('= O**');
  });

  it('checks whether a point is on the curve, showing both sides', () => {
    expect(answerCalculation('Is (3, 10) on E23(1, 1)?', NONE)!.text).toBe(
      '**Yes**, (3, 10) is on E23(1, 1): y² mod p = 8 and x³ + ax + b mod p = 8, the same.',
    );
    expect(answerCalculation('does (3, 11) lie on the curve E23(1, 1)', NONE)!.text).toContain(
      '**No**, (3, 11) is not on E23(1, 1)',
    );
  });

  it('uses the Explorer curve and points when the question does not name them', () => {
    const context: HelperContext = {
      ...NONE,
      curve: E17,
      pointP: { x: 5n, y: 1n },
      pointQ: { x: 6n, y: 3n },
    };
    expect(answerCalculation('What is 5P?', context)!.text).toContain('(9, 16)');
    expect(answerCalculation('what is 2P', context)!.text).toContain('(6, 3)');
    expect(answerCalculation('P + Q?', context)!.text).toContain('(10, 6)');
    expect(answerCalculation('Is (5, 1) on the curve?', context)!.text).toContain('**Yes**');
    expect(answerCalculation('What is (3, 10) + (9, 7)?', { ...NONE, curve: E23 })!.text).toContain(
      '(17, 20)',
    );
  });

  it('explains instead of guessing when something is missing or wrong', () => {
    expect(answerCalculation('What is (3, 10) + (9, 7)?', NONE)!.text).toMatch(/^Which curve\?/);
    expect(answerCalculation('(3, 11) + (9, 7) on E23(1, 1)', NONE)!.text).toContain(
      'is not on E23(1, 1)',
    );
    expect(answerCalculation('(1, 1) + (2, 2) on E21(1, 1)', NONE)!.text).toMatch(/prime/);
    expect(answerCalculation('what is 5P', { ...NONE, curve: E17 })!.text).toMatch(
      /not set to points/,
    );
  });

  it('handles the special cases with the right rule', () => {
    expect(answerCalculation('(3, 10) + (3, 13) on E23(1, 1)', NONE)!.text).toContain(
      'mirror images',
    );
    expect(answerCalculation('0 · (3, 10) on E23(1, 1)', NONE)!.text).toContain('leaves O');
  });

  it('leaves other questions to the rest of the helper', () => {
    for (const question of [
      'What is the point at infinity?',
      'Why must p be prime?',
      'Inverse of 6 mod 23',
      'Is 97 prime?',
      'How does double-and-add work?',
    ]) {
      expect(answerCalculation(question, { ...NONE, curve: E23 }), question).toBeNull();
    }
  });
});
