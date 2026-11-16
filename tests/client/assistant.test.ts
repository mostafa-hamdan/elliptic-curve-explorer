/**
 * Tests for the offline assistant: the built-in answers, the explanations built from
 * the engine's step data, the computed answers (inverse, prime), refusing questions
 * outside the subject, and the markdown parser that keeps answers free of HTML.
 */
import { describe, expect, it } from 'vitest';
import { addWithSteps, createCurve, multiplyWithSteps } from '@shared/ecc/index.ts';
import { parseBlocks, parseInline } from '../../client/src/features/assistant/markdown.ts';
import {
  answerOffline,
  MAX_QUESTION_LENGTH,
  SUGGESTIONS,
  type HelperContext,
} from '../../client/src/features/assistant/offlineHelper.ts';
import { describeWork } from '../../client/src/features/assistant/workContext.ts';

const E23 = createCurve(23n, 1n, 1n);
const E17 = createCurve(17n, 2n, 2n);

/** A context with nothing calculated yet. */
const EMPTY: HelperContext = {
  curve: E23,
  add: null,
  multiply: null,
  points: null,
  lastResult: null,
  tab: 'points',
};

describe('offline helper: built-in topics', () => {
  const cases: Array<[string, RegExp]> = [
    ['What is the point at infinity?', /identity of the group/],
    ['why must p be prime', /every number except 0 has an inverse/],
    ['What does singular mean?', /4a³ \+ 27b² ≡ 0/],
    ['How does double-and-add work?', /Write k in binary/],
    ['What is Hasse’s bound?', /\|N − \(p \+ 1\)\| ≤ 2√p/],
    ['How do I double a point?', /tangent slope/],
    ['what is the order of a point', /smallest n ≥ 1 with `nP = O`/],
    ['Can I use this for my real keys?', /Do not use OnCurve for real keys/],
    ['how does ECDH key exchange work', /Alice/],
    ['what is secp256k1', /Bitcoin/],
    ['can I type hex?', /0x/],
    ['How do I practise for the exam?', /Check my answers/],
    ['can I download the table as csv?', /Printable report/],
  ];
  for (const [question, expected] of cases) {
    it(`answers "${question}"`, () => {
      const answer = answerOffline(question, EMPTY);
      expect(answer.source).toBe('topic');
      expect(answer.text).toMatch(expected);
    });
  }

  it('has an answer for every suggested question', () => {
    for (const suggestion of SUGGESTIONS) {
      const answer = answerOffline(suggestion, EMPTY);
      expect(['topic', 'explain', 'compute'], suggestion).toContain(answer.source);
    }
  });
});

describe('offline helper: computed answers', () => {
  it('computes an inverse with the Euclid lines', () => {
    const answer = answerOffline('inverse of 6 mod 23', EMPTY);
    expect(answer.source).toBe('compute');
    expect(answer.text).toContain('6⁻¹ ≡ **4** (mod 23)');
    expect(answer.text).toContain('- 23 = 3 · 6 + 5');
    expect(answer.text).toContain('Check: 6 · 4 = 24 ≡ 1 (mod 23).');
  });

  it('explains when there is no inverse', () => {
    expect(answerOffline('Inverse of 6 modulo 9?', EMPTY).text).toContain('has **no inverse**');
    expect(answerOffline('inverse of 5 mod 1', EMPTY).text).toContain('at least 2');
  });

  it('tests primes and shows a factor', () => {
    expect(answerOffline('Is 97 prime?', EMPTY).text).toMatch(/^\*\*Yes\*\*, 97 is prime\./);
    expect(answerOffline('is 21 a prime', EMPTY).text).toBe(
      '**No**, 21 is not prime (21 = 3 × 7).',
    );
    expect(answerOffline('is 3 prime', EMPTY).text).toContain('too small to use as p');
    expect(answerOffline('is 0x17 prime', EMPTY).text).toContain('23 is prime');
  });
});

describe('offline helper: explain my last result', () => {
  it('says how to get a result when there is none', () => {
    const answer = answerOffline('Explain my last result', EMPTY);
    expect(answer.source).toBe('explain');
    expect(answer.text).toContain('There is no result to explain yet');
  });

  it('explains an addition with the numbers from the trace', () => {
    const trace = addWithSteps(E23, { x: 3n, y: 10n }, { x: 9n, y: 7n });
    const context: HelperContext = {
      ...EMPTY,
      add: { curve: E23, trace },
      lastResult: 'add',
      tab: 'add',
    };
    const text = answerOffline('explain my last result', context).text;
    expect(text).toContain('The answer is **(17, 20)**');
    expect(text).toContain('chord rule');
    expect(text).toContain('6⁻¹ ≡ 4');
    expect(text).toContain('λ ≡ 20 · 4 ≡ **11** (mod 23)');
  });

  it('explains the special cases of addition', () => {
    const inverses = addWithSteps(E23, { x: 3n, y: 10n }, { x: 3n, y: 13n });
    const context: HelperContext = {
      ...EMPTY,
      add: { curve: E23, trace: inverses },
      lastResult: 'add',
    };
    expect(answerOffline('explain this', context).text).toContain('P + (−P) = O');
  });

  it('explains a multiplication, including a result of O', () => {
    const trace = multiplyWithSteps(E17, 19n, { x: 5n, y: 1n });
    const context: HelperContext = {
      ...EMPTY,
      curve: E17,
      multiply: { curve: E17, trace },
      lastResult: 'multiply',
      tab: 'add',
    };
    const text = answerOffline('Explain my last result', context).text;
    expect(text).toContain('**19P**');
    expect(text).toContain('`10011`');
    expect(text).toContain('4 doublings and 2 additions');
    expect(text).toContain('multiple of the **order** of P');
  });

  it('prefers the result of the tab on screen', () => {
    const add = { curve: E23, trace: addWithSteps(E23, { x: 3n, y: 10n }, { x: 9n, y: 7n }) };
    const multiply = { curve: E17, trace: multiplyWithSteps(E17, 2n, { x: 5n, y: 1n }) };
    const base = { ...EMPTY, add, multiply, lastResult: 'multiply' as const };
    expect(answerOffline('explain my result', { ...base, tab: 'add' }).text).toContain('P + Q');
    expect(answerOffline('explain my result', { ...base, tab: 'points' }).text).toContain('**2P**');
    const points = { curve: E23, count: 27 };
    expect(answerOffline('explain my result', { ...base, points, tab: 'points' }).text).toContain(
      'has **28 points**',
    );
  });
});

describe('offline helper: scope and limits', () => {
  it('declines questions outside the subject', () => {
    for (const question of [
      'What is the weather today?',
      'Write me a poem about cats',
      'who won the match',
    ]) {
      expect(answerOffline(question, EMPTY).source, question).toBe('decline');
    }
  });

  it('asks for a question when the box is empty, and refuses very long ones', () => {
    expect(answerOffline('   ', EMPTY).source).toBe('empty');
    const long = `curve ${'x'.repeat(MAX_QUESTION_LENGTH)}`;
    expect(answerOffline(long, EMPTY).text).toContain('under 500 characters');
  });

  it('offers the list of things it can do for unknown on-subject questions', () => {
    expect(answerOffline('tell me about the curve colour', EMPTY).source).toBe('fallback');
  });
});

describe('assistant markdown', () => {
  it('splits paragraphs and lists', () => {
    expect(parseBlocks('Intro\n- one\n- two\n\n1. first\n2. second\nEnd')).toEqual([
      { type: 'paragraph', text: 'Intro' },
      { type: 'list', ordered: false, items: ['one', 'two'] },
      { type: 'list', ordered: true, items: ['first', 'second'] },
      { type: 'paragraph', text: 'End' },
    ]);
  });

  it('finds bold and code, and leaves unmatched markers alone', () => {
    expect(parseInline('a **b** `c` d')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'b' },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'c' },
      { type: 'text', text: ' d' },
    ]);
    expect(parseInline('2 * 3 ** 4')).toEqual([{ type: 'text', text: '2 * 3 ** 4' }]);
  });

  it('treats HTML as plain text', () => {
    const spans = parseInline('<img src=x onerror=alert(1)> **<b>**');
    expect(spans.map((span) => span.text)).toEqual(['<img src=x onerror=alert(1)> ', '<b>']);
  });
});

describe('work description for AI mode', () => {
  it('describes the curve, points, k and the latest results briefly', () => {
    const trace = addWithSteps(E23, { x: 3n, y: 10n }, { x: 9n, y: 7n });
    const text = describeWork(
      { ...EMPTY, add: { curve: E23, trace }, tab: 'add' },
      {
        pointP: { x: '3', y: '10', infinity: false },
        pointQ: { x: '', y: '', infinity: true },
        k: '13',
      },
    );
    expect(text).toBe(
      'curve E23(1, 1); P = (3, 10); Q = O; k = 13; open tab: add; last addition: (3, 10) + (9, 7) = (17, 20).',
    );
  });

  it('is empty without a curve and stays short for huge numbers', () => {
    const inputs = {
      pointP: { x: '', y: '', infinity: false },
      pointQ: { x: '', y: '', infinity: false },
      k: '',
    };
    expect(describeWork({ ...EMPTY, curve: null }, inputs)).toBe('');
    const big = describeWork(
      { ...EMPTY, curve: { p: 2n ** 255n - 19n, a: 0n, b: 7n } },
      { ...inputs, k: '9'.repeat(300) },
    );
    expect(big.length).toBeLessThanOrEqual(900);
    expect(big).toContain('255-bit p');
  });
});
