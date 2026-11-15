/**
 * Bad input must always produce a clear message and never a crash: empty boxes, letters,
 * decimals, non-prime p, singular curves, points off the curve and oversized numbers.
 * Also checks that every preset is a valid, working example.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addWithSteps,
  createCurve,
  CURVE_PRESETS,
  EccError,
  isEccError,
  makePoint,
  MAX_FIELD_BITS,
  MAX_INPUT_LENGTH,
  multiplyWithSteps,
  parseInteger,
  tryParseInteger,
  type EccErrorCode,
} from '@shared/ecc/index.ts';

/** Run a function and return the EccError code it throws, or 'none'. */
function codeOf(action: () => unknown): EccErrorCode | 'none' | 'not-ecc-error' {
  try {
    action();
    return 'none';
  } catch (error) {
    return isEccError(error) ? error.code : 'not-ecc-error';
  }
}

describe('parseInteger', () => {
  it('reads decimal, signed and hexadecimal numbers', () => {
    expect(parseInteger('23', 'p')).toBe(23n);
    expect(parseInteger('  23  ', 'p')).toBe(23n);
    expect(parseInteger('-5', 'a')).toBe(-5n);
    expect(parseInteger('+7', 'a')).toBe(7n);
    expect(parseInteger('007', 'a')).toBe(7n);
    expect(parseInteger('0xff', 'p')).toBe(255n);
    expect(parseInteger('0XFF', 'p')).toBe(255n);
    expect(parseInteger('-0x10', 'a')).toBe(-16n);
    expect(parseInteger('1 000_000,000', 'k')).toBe(1_000_000_000n);
    expect(parseInteger('0', 'k')).toBe(0n);
    expect(parseInteger('-0', 'k')).toBe(0n);
  });

  it('reads a 256-bit hexadecimal prime exactly', () => {
    const text = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F';
    expect(parseInteger(text, 'p')).toBe(2n ** 256n - 2n ** 32n - 977n);
  });

  it('says a value is missing when the box is empty', () => {
    for (const empty of ['', '   ', '\t', '_', ',']) {
      expect(codeOf(() => parseInteger(empty, 'p'))).toBe('EMPTY');
    }
    expect(() => parseInteger('', 'p')).toThrow('Enter a value for p.');
  });

  it('refuses anything that is not a whole number', () => {
    const bad = ['abc', '12a', '1e5', '--5', '5-', '0x', '0xZZ', 'NaN', 'Infinity', '٣', '1/2'];
    for (const text of bad) {
      expect(
        codeOf(() => parseInteger(text, 'k')),
        text,
      ).toBe('NOT_AN_INTEGER');
    }
    expect(() => parseInteger('abc', 'k')).toThrow(/k must be a whole number/);
  });

  it('gives a specific message for decimals', () => {
    for (const text of ['2.5', '.5', '3.', '-1.25']) {
      expect(() => parseInteger(text, 'a'), text).toThrow(/without a decimal point/);
    }
    expect(codeOf(() => parseInteger('.', 'a'))).toBe('NOT_AN_INTEGER');
  });

  it('refuses script and injection payloads as plain bad input', () => {
    for (const text of ['<script>alert(1)</script>', "1'; DROP TABLE users;--", '${7*7}']) {
      expect(codeOf(() => parseInteger(text, 'p'))).toBe('NOT_AN_INTEGER');
    }
  });

  it('refuses over-long text before trying to read it', () => {
    expect(codeOf(() => parseInteger('9'.repeat(MAX_INPUT_LENGTH + 1), 'k'))).toBe('TOO_LARGE');
    expect(codeOf(() => parseInteger('9'.repeat(MAX_INPUT_LENGTH), 'k'))).toBe('none');
  });

  it('never throws anything except EccError, whatever is typed', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (text) => {
        const code = codeOf(() => parseInteger(text, 'x'));
        return code !== 'not-ecc-error';
      }),
      { numRuns: 1000 },
    );
  });

  it('round-trips every integer through its decimal text', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(1n << 300n), max: 1n << 300n }), (n) => {
        return parseInteger(n.toString(), 'n') === n;
      }),
    );
  });

  it('tryParseInteger returns a result object instead of throwing', () => {
    expect(tryParseInteger('17', 'p')).toEqual({ ok: true, value: 17n });
    expect(tryParseInteger('x', 'p')).toMatchObject({ ok: false, code: 'NOT_AN_INTEGER' });
  });
});

describe('createCurve', () => {
  it('refuses a p that is not prime and shows a factor', () => {
    expect(() => createCurve(21n, 1n, 1n)).toThrow('p must be prime, but 21 is not (21 = 3 × 7).');
    expect(() => createCurve(4n, 1n, 1n)).toThrow(/4 = 2 × 2/);
    expect(codeOf(() => createCurve(561n, 1n, 1n))).toBe('NOT_PRIME');
    expect(codeOf(() => createCurve(2n ** 256n - 1n, 0n, 7n))).toBe('NOT_PRIME');
  });

  it('refuses p below 2, including negatives', () => {
    for (const p of [1n, 0n, -7n, -23n]) {
      expect(
        codeOf(() => createCurve(p, 1n, 1n)),
        `${p}`,
      ).toBe('NOT_PRIME');
    }
    expect(() => createCurve(-7n, 1n, 1n)).toThrow(/prime number greater than 3/);
  });

  it('refuses p = 2 and p = 3 with an explanation', () => {
    expect(codeOf(() => createCurve(2n, 1n, 1n))).toBe('PRIME_TOO_SMALL');
    expect(() => createCurve(3n, 1n, 1n)).toThrow(/prime greater than 3/);
  });

  it('refuses singular curves', () => {
    expect(codeOf(() => createCurve(23n, 0n, 0n))).toBe('SINGULAR');
    // a = −3, b = 2: 4·(−27) + 27·4 = 0 for every p.
    expect(codeOf(() => createCurve(23n, -3n, 2n))).toBe('SINGULAR');
    expect(codeOf(() => createCurve(97n, -3n, 2n))).toBe('SINGULAR');
    expect(() => createCurve(23n, 0n, 0n)).toThrow(/singular: 4a³ \+ 27b² ≡ 0 \(mod 23\)/);
  });

  it('refuses a p with more bits than the limit', () => {
    expect(codeOf(() => createCurve(1n << BigInt(MAX_FIELD_BITS), 1n, 1n))).toBe('TOO_LARGE');
  });

  it('accepts a 521-bit prime field', () => {
    expect(codeOf(() => createCurve(2n ** 521n - 1n, -3n, 5n))).toBe('none');
  });
});

describe('points that are not on the curve', () => {
  const curve = createCurve(23n, 1n, 1n);

  it('are refused, showing both sides of the equation', () => {
    // y² = 11² = 121 ≡ 6, but x³ + x + 1 = 27 + 3 + 1 = 31 ≡ 8 (mod 23).
    expect(() => makePoint(curve, 3n, 11n)).toThrow(
      '(3, 11) is not on E23(1, 1): y² mod p = 6, but x³ + ax + b mod p = 8.',
    );
    expect(codeOf(() => makePoint(curve, 3n, 11n))).toBe('NOT_ON_CURVE');
  });

  it('are refused by addition and multiplication as well', () => {
    const off = { x: 3n, y: 11n };
    const on = { x: 3n, y: 10n };
    expect(codeOf(() => addWithSteps(curve, off, on))).toBe('NOT_ON_CURVE');
    expect(codeOf(() => addWithSteps(curve, on, off))).toBe('NOT_ON_CURVE');
    expect(codeOf(() => multiplyWithSteps(curve, 2n, off))).toBe('NOT_ON_CURVE');
    // Coordinates outside 0 … p − 1 are not accepted as-is either.
    expect(codeOf(() => addWithSteps(curve, { x: 26n, y: 10n }, on))).toBe('NOT_ON_CURVE');
  });

  it('accepts coordinates given outside 0 … p − 1 by reducing them', () => {
    expect(makePoint(curve, 26n, -13n)).toEqual({ x: 3n, y: 10n });
  });
});

describe('presets', () => {
  it('all describe valid curves with sample points on them', () => {
    expect(CURVE_PRESETS.length).toBeGreaterThanOrEqual(7);
    const ids = new Set<string>();
    for (const preset of CURVE_PRESETS) {
      ids.add(preset.id);
      const curve = createCurve(
        parseInteger(preset.p, 'p'),
        parseInteger(preset.a, 'a'),
        parseInteger(preset.b, 'b'),
      );
      const P = makePoint(
        curve,
        parseInteger(preset.pointP[0], 'x'),
        parseInteger(preset.pointP[1], 'y'),
      );
      const Q = makePoint(
        curve,
        parseInteger(preset.pointQ[0], 'x'),
        parseInteger(preset.pointQ[1], 'y'),
      );
      // The sample addition and multiplication must run and give a point, not O.
      expect(addWithSteps(curve, P, Q).result, preset.id).not.toBeNull();
      expect(multiplyWithSteps(curve, parseInteger(preset.k, 'k'), P).result).not.toBeNull();
    }
    expect(ids.size).toBe(CURVE_PRESETS.length);
  });

  it('lists the two classroom curves first', () => {
    expect(CURVE_PRESETS.slice(0, 2).map((preset) => preset.id)).toEqual(['e23-1-1', 'e17-2-2']);
  });
});

describe('error type', () => {
  it('carries a code, a name and a readable message', () => {
    const error = new EccError('EMPTY', 'Enter a value for p.');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EccError');
    expect(isEccError(error)).toBe(true);
    expect(isEccError(new Error('x'))).toBe(false);
    expect(isEccError('text')).toBe(false);
  });
});
