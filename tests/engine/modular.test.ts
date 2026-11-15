/**
 * Tests for the modular arithmetic layer: reduction, powers, integer square root, the
 * extended Euclidean algorithm, primality and square roots modulo a prime.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bitLength,
  EccError,
  findSmallFactor,
  inverseTrace,
  isPrime,
  isqrt,
  legendreSymbol,
  mod,
  modInverse,
  modPow,
  sqrtMod,
} from '@shared/ecc/index.ts';

/** Primes below a limit by the sieve of Eratosthenes: an independent primality check. */
function sieve(limit: number): boolean[] {
  const prime = new Array<boolean>(limit).fill(true);
  prime[0] = false;
  prime[1] = false;
  for (let i = 2; i * i < limit; i += 1) {
    if (prime[i]) for (let j = i * i; j < limit; j += i) prime[j] = false;
  }
  return prime;
}

describe('mod', () => {
  it('lifts negative values into 0 … m − 1', () => {
    expect(mod(-3n, 23n)).toBe(20n);
    expect(mod(-23n, 23n)).toBe(0n);
    expect(mod(-164n, 23n)).toBe(20n);
    expect(mod(109n, 23n)).toBe(17n);
  });

  it('refuses a zero or negative modulus', () => {
    expect(() => mod(5n, 0n)).toThrow(EccError);
    expect(() => mod(5n, -7n)).toThrow(EccError);
  });

  it('always lands in range and differs from n by a multiple of m', () => {
    fc.assert(
      fc.property(fc.bigInt(), fc.bigInt({ min: 1n, max: 1n << 300n }), (n, m) => {
        const r = mod(n, m);
        return r >= 0n && r < m && (n - r) % m === 0n;
      }),
    );
  });
});

describe('modPow', () => {
  it('matches hand-checked values', () => {
    expect(modPow(2n, 10n, 1000n)).toBe(24n);
    expect(modPow(3n, 0n, 7n)).toBe(1n);
    expect(modPow(0n, 0n, 7n)).toBe(1n);
    expect(modPow(5n, 3n, 1n)).toBe(0n);
    expect(modPow(-2n, 3n, 7n)).toBe(6n); // −8 ≡ 6 (mod 7)
  });

  it('agrees with repeated multiplication', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000n }),
        fc.integer({ min: 0, max: 60 }),
        fc.bigInt({ min: 1n, max: 10_000n }),
        (base, exponent, modulus) => {
          let expected = 1n % modulus;
          for (let i = 0; i < exponent; i += 1) expected = (expected * base) % modulus;
          return modPow(base, BigInt(exponent), modulus) === expected;
        },
      ),
    );
  });

  it('satisfies Fermat: a^(p−1) ≡ 1 for a 256-bit prime', () => {
    const p = 2n ** 256n - 2n ** 32n - 977n;
    expect(modPow(123456789n, p - 1n, p)).toBe(1n);
  });

  it('refuses a negative exponent', () => {
    expect(() => modPow(2n, -1n, 7n)).toThrow(EccError);
  });
});

describe('bitLength and isqrt', () => {
  it('counts bits', () => {
    expect(bitLength(0n)).toBe(0);
    expect(bitLength(1n)).toBe(1);
    expect(bitLength(5n)).toBe(3);
    expect(bitLength(2n ** 256n)).toBe(257);
  });

  it('returns the floor of the square root', () => {
    expect(isqrt(0n)).toBe(0n);
    expect(isqrt(1n)).toBe(1n);
    expect(isqrt(15n)).toBe(3n);
    expect(isqrt(16n)).toBe(4n);
    expect(isqrt(17n)).toBe(4n);
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1n << 600n }), (n) => {
        const r = isqrt(n);
        return r * r <= n && (r + 1n) * (r + 1n) > n;
      }),
    );
  });

  it('refuses a negative number', () => {
    expect(() => isqrt(-1n)).toThrow(EccError);
  });
});

describe('extended Euclid', () => {
  it('finds 6⁻¹ mod 23 = 4 with the expected lines', () => {
    const trace = inverseTrace(6n, 23n);
    expect(trace.inverse).toBe(4n);
    expect(trace.gcd).toBe(1n);
    // 23 = 3·6 + 5, 6 = 1·5 + 1, 5 = 5·1 + 0
    expect(trace.steps.map((s) => [s.dividend, s.quotient, s.divisor, s.remainder])).toEqual([
      [23n, 3n, 6n, 5n],
      [6n, 1n, 5n, 1n],
      [5n, 5n, 1n, 0n],
    ]);
    expect(trace.steps.map((s) => s.tRemainder)).toEqual([-3n, 4n, -23n]);
  });

  it('reduces the value first and handles negatives', () => {
    expect(inverseTrace(-17n, 23n).value).toBe(6n);
    expect(modInverse(-17n, 23n)).toBe(4n);
    expect(modInverse(1n, 23n)).toBe(1n);
    expect(modInverse(22n, 23n)).toBe(22n);
  });

  it('reports no inverse when the value shares a factor with the modulus', () => {
    expect(inverseTrace(0n, 23n).inverse).toBeNull();
    expect(inverseTrace(6n, 9n)).toMatchObject({ gcd: 3n, inverse: null });
    expect(() => modInverse(0n, 23n)).toThrow(/no inverse/);
    expect(() => modInverse(6n, 9n)).toThrow(EccError);
  });

  it('keeps every line consistent: division, coefficients and the final answer', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 2n, max: 1n << 260n }),
        fc.bigInt({ min: 0n, max: 1n << 260n }),
        (modulus, value) => {
          const trace = inverseTrace(value, modulus);
          for (const step of trace.steps) {
            // dividend = quotient × divisor + remainder, with 0 ≤ remainder < divisor
            if (step.dividend !== step.quotient * step.divisor + step.remainder) return false;
            if (step.remainder < 0n || step.remainder >= step.divisor) return false;
            // t × value ≡ remainder (mod m) on every line
            if (step.tRemainder !== step.tDividend - step.quotient * step.tDivisor) return false;
            if (mod(step.tRemainder * trace.value, modulus) !== mod(step.remainder, modulus)) {
              return false;
            }
          }
          if (trace.inverse === null) return trace.gcd !== 1n;
          return (
            mod(trace.inverse * trace.value, modulus) === 1n &&
            trace.inverse === modInverse(value, modulus)
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('isPrime', () => {
  it('agrees with a sieve for every number below 20000', () => {
    const expected = sieve(20_000);
    for (let n = 0; n < 20_000; n += 1) {
      if (isPrime(BigInt(n)) !== expected[n]) {
        throw new Error(`isPrime(${n}) disagrees with the sieve`);
      }
    }
  });

  it('rejects negatives, 0 and 1', () => {
    expect(isPrime(-7n)).toBe(false);
    expect(isPrime(0n)).toBe(false);
    expect(isPrime(1n)).toBe(false);
  });

  it('rejects Carmichael numbers and strong pseudoprimes to small bases', () => {
    for (const n of [561n, 1105n, 1729n, 2047n, 3215031751n, 3825123056546413051n]) {
      expect(isPrime(n), `${n}`).toBe(false);
    }
  });

  it('accepts well-known large primes', () => {
    expect(isPrime(2n ** 61n - 1n)).toBe(true);
    expect(isPrime(2n ** 127n - 1n)).toBe(true);
    expect(isPrime(2n ** 255n - 19n)).toBe(true);
    expect(isPrime(2n ** 256n - 2n ** 32n - 977n)).toBe(true); // secp256k1
    expect(isPrime(2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n)).toBe(true); // P-256
    expect(isPrime(2n ** 521n - 1n)).toBe(true);
  });

  it('rejects large composites', () => {
    expect(isPrime(2n ** 256n - 1n)).toBe(false);
    expect(isPrime((2n ** 127n - 1n) * (2n ** 61n - 1n))).toBe(false);
    expect(isPrime((2n ** 255n - 19n) ** 2n)).toBe(false);
  });
});

describe('findSmallFactor', () => {
  it('finds the smallest factor of small composites', () => {
    expect(findSmallFactor(21n)).toBe(3n);
    expect(findSmallFactor(4n)).toBe(2n);
    expect(findSmallFactor(49n)).toBe(7n);
    expect(findSmallFactor(23n)).toBeNull();
  });

  it('gives up quietly when the factors are large', () => {
    expect(findSmallFactor((2n ** 127n - 1n) * (2n ** 61n - 1n))).toBeNull();
  });
});

describe('square roots modulo a prime', () => {
  // 17, 97 and 257 have p ≡ 1 (mod 4) with several factors of two in p − 1, which is
  // the case that needs the full Tonelli-Shanks loop; 7, 23 and 103 use the shortcut.
  const primes = [5n, 7n, 13n, 17n, 23n, 41n, 97n, 103n, 193n, 257n, 65537n];

  it('finds a root exactly when one exists, for every value', () => {
    for (const p of primes.filter((q) => q < 1000n)) {
      const squares = new Set<bigint>();
      for (let y = 0n; y < p; y += 1n) squares.add((y * y) % p);
      for (let n = 0n; n < p; n += 1n) {
        const root = sqrtMod(n, p);
        if (squares.has(n)) {
          expect(root, `sqrt(${n}) mod ${p}`).not.toBeNull();
          expect((root! * root!) % p).toBe(n);
          expect(root! <= p - root!, 'the smaller root is returned').toBe(true);
        } else {
          expect(root, `sqrt(${n}) mod ${p}`).toBeNull();
        }
      }
    }
  });

  it('matches Euler’s criterion', () => {
    expect(legendreSymbol(0n, 23n)).toBe(0);
    expect(legendreSymbol(4n, 23n)).toBe(1);
    expect(legendreSymbol(5n, 23n)).toBe(-1);
    expect(legendreSymbol(-19n, 23n)).toBe(1); // −19 ≡ 4
  });

  it('roots random squares for primes of every shape, including 256-bit', () => {
    const big = [...primes, 2n ** 127n - 1n, 2n ** 256n - 2n ** 32n - 977n, 2n ** 255n - 19n];
    fc.assert(
      fc.property(fc.constantFrom(...big), fc.bigInt({ min: 0n, max: 1n << 256n }), (p, seed) => {
        const y = seed % p;
        const square = (y * y) % p;
        const root = sqrtMod(square, p);
        return root !== null && (root * root) % p === square;
      }),
      { numRuns: 200 },
    );
  });
});
