/**
 * Tests for the live validation used by the Explorer page (curve boxes, points, k) and
 * for the text formatting helpers. These are plain functions, so they are tested here
 * without a browser; the browser tests then check that the screens display them.
 */
import { describe, expect, it } from 'vitest';
import {
  checkCurve,
  checkInteger,
  checkPoint,
  checkScalar,
  pointProblem,
} from '../../client/src/features/explorer/validation.ts';
import { multiplyWithSteps } from '@shared/ecc/index.ts';
import { multiplySummary } from '../../client/src/features/multiply/summary.ts';
import {
  count,
  curveKey,
  equationText,
  grouped,
  plain,
  pointText,
  shortNumber,
  signed,
} from '../../client/src/lib/format.ts';

describe('checkInteger', () => {
  it('separates empty, valid and invalid input', () => {
    expect(checkInteger('', 'p')).toEqual({
      status: 'empty',
      value: null,
      message: 'Enter a value for p.',
    });
    expect(checkInteger(' 23 ', 'p')).toEqual({ status: 'ok', value: 23n, message: null });
    expect(checkInteger('2x', 'p')).toMatchObject({ status: 'error', value: null });
  });
});

describe('checkCurve', () => {
  it('accepts E23(1, 1) and reports its details', () => {
    const check = checkCurve('23', '1', '1');
    expect(check.curve).toEqual({ p: 23n, a: 1n, b: 1n });
    expect(check).toMatchObject({ singular: false, singularity: 8n, bits: 5 });
  });

  it('reduces a and b mod p', () => {
    const check = checkCurve('23', '24', '-22');
    expect(check.curve).toEqual({ p: 23n, a: 1n, b: 1n });
    expect(check.aReduced).toBe(1n);
    expect(check.bReduced).toBe(1n);
  });

  it('puts the reason on the p box when p is not usable', () => {
    expect(checkCurve('21', '1', '1').p).toMatchObject({
      status: 'error',
      message: 'p must be prime, but 21 is not (21 = 3 × 7).',
    });
    expect(checkCurve('3', '1', '1').p.status).toBe('error');
    expect(checkCurve('-5', '1', '1').p.status).toBe('error');
    expect(checkCurve('21', '1', '1').curve).toBeNull();
  });

  it('flags a singular curve without calling any single box wrong', () => {
    const check = checkCurve('23', '0', '0');
    expect(check.singular).toBe(true);
    expect(check.curve).toBeNull();
    expect([check.p.status, check.a.status, check.b.status]).toEqual(['ok', 'ok', 'ok']);
  });

  it('waits quietly while boxes are still empty', () => {
    const check = checkCurve('23', '', '1');
    expect(check.a.status).toBe('empty');
    expect(check.curve).toBeNull();
    expect(check.singular).toBe(false);
    expect(check.bReduced).toBe(1n);
  });

  it('reports errors in a and b independently of p', () => {
    const check = checkCurve('', 'x', '1.5');
    expect(check.p.status).toBe('empty');
    expect(check.a.status).toBe('error');
    expect(check.b.message).toMatch(/without a decimal point/);
  });
});

describe('checkPoint', () => {
  const curve = checkCurve('23', '1', '1').curve;

  it('accepts a point on the curve and shows both sides', () => {
    const check = checkPoint(curve, { x: '3', y: '10', infinity: false }, 'P');
    expect(check.point).toEqual({ x: 3n, y: 10n });
    expect(check.sides).toEqual({ left: 8n, right: 8n });
    expect(check.onCurve).toBe(true);
    expect(pointProblem(check, 'P')).toBeNull();
  });

  it('rejects a point off the curve and shows both sides', () => {
    const check = checkPoint(curve, { x: '3', y: '11', infinity: false }, 'P');
    expect(check.point).toBeUndefined();
    expect(check.sides).toEqual({ left: 6n, right: 8n });
    expect(check.onCurve).toBe(false);
    expect(pointProblem(check, 'P')).toMatch(/P is not on the curve/);
  });

  it('treats the infinity tick as the point O and ignores the boxes', () => {
    const check = checkPoint(curve, { x: 'junk', y: '', infinity: true }, 'Q');
    expect(check.point).toBeNull();
    expect(check.onCurve).toBe(true);
    expect(pointProblem(check, 'Q')).toBeNull();
  });

  it('reduces coordinates mod p and says so', () => {
    const check = checkPoint(curve, { x: '26', y: '-13', infinity: false }, 'P');
    expect(check.point).toEqual({ x: 3n, y: 10n });
    expect(check.wasReduced).toBe(true);
    expect(checkPoint(curve, { x: '3', y: '10', infinity: false }, 'P').wasReduced).toBe(false);
  });

  it('explains missing and non-numeric coordinates', () => {
    const missing = checkPoint(curve, { x: '3', y: '', infinity: false }, 'Q');
    expect(missing.point).toBeUndefined();
    expect(missing.y.message).toBe('Enter a value for y of Q.');
    expect(pointProblem(missing, 'Q')).toMatch(/Enter both coordinates of Q/);

    const bad = checkPoint(curve, { x: 'three', y: '10', infinity: false }, 'Q');
    expect(pointProblem(bad, 'Q')).toBe('Point Q has a coordinate that is not a whole number.');
  });

  it('cannot decide while the curve is not valid', () => {
    const check = checkPoint(null, { x: '3', y: '10', infinity: false }, 'P');
    expect(check.point).toBeUndefined();
    expect(check.onCurve).toBeNull();
    expect(pointProblem(check, 'P')).toMatch(/until the curve is valid/);
  });
});

describe('checkScalar', () => {
  it('accepts zero, negative and hexadecimal values', () => {
    expect(checkScalar('0').value).toBe(0n);
    expect(checkScalar('-5').value).toBe(-5n);
    expect(checkScalar('0x10').value).toBe(16n);
  });

  it('rejects empty, non-numeric and oversized values', () => {
    expect(checkScalar('').status).toBe('empty');
    expect(checkScalar('k').status).toBe('error');
    expect(checkScalar((2n ** 1024n).toString())).toMatchObject({
      status: 'error',
      message: expect.stringMatching(/k is too large/),
    });
    expect(checkScalar((-(2n ** 1024n)).toString()).status).toBe('error');
    expect(checkScalar((2n ** 1024n - 1n).toString()).status).toBe('ok');
  });
});

describe('formatting', () => {
  it('shortens only very long numbers', () => {
    expect(shortNumber(123456n)).toBe('123456');
    expect(shortNumber(10n ** 23n)).toBe((10n ** 23n).toString());
    expect(shortNumber(1234567890123456789012345678901234567890n)).toBe('1234567890…1234567890');
    expect(shortNumber(-1234567890123456789012345678901234567890n)).toBe('-1234567890…1234567890');
  });

  it('writes points, with O for the point at infinity', () => {
    expect(pointText(null)).toBe('O');
    expect(pointText({ x: 17n, y: 20n })).toBe('(17, 20)');
  });

  it('uses a real minus sign and brackets negatives inside formulas', () => {
    expect(plain(-164n)).toBe('−164');
    expect(plain(20n)).toBe('20');
    expect(signed(-3n)).toBe('(−3)');
    expect(signed(6n)).toBe('6');
  });

  it('groups digits', () => {
    expect(grouped(199999)).toBe('199,999');
    expect(grouped(200000n)).toBe('200,000');
  });

  it('writes the curve equation the way it is written by hand', () => {
    expect(equationText({ p: 23n, a: 1n, b: 1n })).toBe('y² ≡ x³ + x + 1 (mod 23)');
    expect(equationText({ p: 17n, a: 2n, b: 2n })).toBe('y² ≡ x³ + 2x + 2 (mod 17)');
    expect(equationText({ p: 13n, a: 0n, b: 7n })).toBe('y² ≡ x³ + 7 (mod 13)');
    expect(equationText({ p: 23n, a: 1n, b: 0n })).toBe('y² ≡ x³ + x (mod 23)');
    expect(equationText({ p: 2n ** 255n - 19n, a: 0n, b: 7n })).toBeNull();
  });

  it('gives each curve a distinct key', () => {
    expect(curveKey(null)).toBe('');
    expect(curveKey({ p: 23n, a: 1n, b: 1n })).toBe('23:1:1');
  });
});

describe('counts and the multiply summary', () => {
  const curve = { p: 17n, a: 2n, b: 2n };
  const P = { x: 5n, y: 1n };

  it('uses the singular only for exactly one', () => {
    expect(count(0, 'addition')).toBe('0 additions');
    expect(count(1, 'addition')).toBe('1 addition');
    expect(count(1n, 'bit')).toBe('1 bit');
    expect(count(2048, 'point')).toBe('2,048 points');
    expect(count(2, 'child', 'children')).toBe('2 children');
  });

  it('never prints "1 additions" or "1 doublings", for any k up to 300', () => {
    for (let k = 1n; k <= 300n; k += 1n) {
      const text = multiplySummary(multiplyWithSteps(curve, k, P));
      expect(text, `k = ${k}`).not.toMatch(/\b1 (additions|doublings|bits)\b/);
      expect(text, `k = ${k}`).not.toMatch(/\b(0|[2-9]|\d{2,}) (addition|doubling|bit)\b/);
    }
  });

  it('describes k = 1, 2 and 13 correctly', () => {
    expect(multiplySummary(multiplyWithSteps(curve, 1n, P))).toBe(
      '1 bit: no doubling and no addition are needed, because 1 · P is P itself.',
    );
    expect(multiplySummary(multiplyWithSteps(curve, 2n, P))).toBe(
      '2 bits: 1 doubling and 0 additions, instead of 1 addition one at a time.',
    );
    expect(multiplySummary(multiplyWithSteps(curve, 13n, P))).toBe(
      '4 bits: 3 doublings and 2 additions, instead of 12 additions one at a time.',
    );
  });

  it('gives the size of the naive count for a huge k', () => {
    const text = multiplySummary(multiplyWithSteps(curve, 10n ** 40n, P));
    expect(text).toMatch(/instead of \|k\| − 1 additions one at a time, a 41-digit number\.$/);
  });
});
