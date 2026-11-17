/**
 * Modular arithmetic on `bigint`: the number tools that the curve math is built from.
 * Reduction, fast powers, the extended Euclidean algorithm (with every step recorded so
 * a screen can show the hand method), primality testing and square roots modulo a prime.
 * Nothing here knows about curves; `curve.ts` and `point.ts` build on top of it.
 */
import { EccError } from './errors.ts';

/**
 * Reduce `n` into the range 0 … m − 1.
 *
 * Formula: n mod m. JavaScript's `%` keeps the sign of `n` (−3 % 23 is −3), so a negative
 * remainder is lifted by adding m (giving 20), which is what the hand method expects.
 *
 * @param n - any integer, negative allowed.
 * @param m - the modulus, must be positive.
 * @returns the remainder r with 0 ≤ r < m.
 * @throws EccError('BAD_ARGUMENT') when m is zero or negative.
 */
export function mod(n: bigint, m: bigint): bigint {
  if (m <= 0n) {
    throw new EccError('BAD_ARGUMENT', 'The modulus must be a positive whole number.');
  }
  const remainder = n % m;
  return remainder < 0n ? remainder + m : remainder;
}

/**
 * Raise `base` to `exponent` modulo `modulus` by square-and-multiply.
 *
 * Formula: base^exponent mod modulus. The exponent is read bit by bit from the right;
 * the base is squared at every bit and multiplied in when the bit is 1, so a 256-bit
 * exponent needs about 256 squarings instead of an impossible number of multiplications.
 *
 * @param base - any integer.
 * @param exponent - a whole number ≥ 0.
 * @param modulus - a positive integer.
 * @returns base^exponent mod modulus, in the range 0 … modulus − 1.
 * @throws EccError('BAD_ARGUMENT') for a negative exponent or a non-positive modulus.
 */
export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (exponent < 0n) {
    throw new EccError('BAD_ARGUMENT', 'The exponent must not be negative.');
  }
  let result = mod(1n, modulus); // 0 when the modulus is 1, otherwise 1
  let square = mod(base, modulus);
  let remaining = exponent;
  while (remaining > 0n) {
    if (remaining & 1n) {
      result = (result * square) % modulus;
    }
    square = (square * square) % modulus;
    remaining >>= 1n;
  }
  return result;
}

/**
 * Count the binary digits of a non-negative integer.
 *
 * @param n - a whole number ≥ 0.
 * @returns the number of bits (0 for n = 0, 3 for n = 5 because 5 = 101₂).
 */
export function bitLength(n: bigint): number {
  return n <= 0n ? 0 : n.toString(2).length;
}

/**
 * Integer square root by Newton's method.
 *
 * Formula: the largest r with r² ≤ n. Used for the Hasse bound, where 2√p must be
 * compared exactly and floating point would lose digits for large p.
 *
 * @param n - a whole number ≥ 0.
 * @returns floor(√n).
 * @throws EccError('BAD_ARGUMENT') when n is negative.
 */
export function isqrt(n: bigint): bigint {
  if (n < 0n) {
    throw new EccError('BAD_ARGUMENT', 'Cannot take the square root of a negative number.');
  }
  if (n < 2n) return n;
  // Start at a power of two that is certainly ≥ √n, then let Newton's steps walk down.
  let estimate = 1n << BigInt((bitLength(n) + 1) >> 1);
  for (;;) {
    const next = (estimate + n / estimate) >> 1n;
    if (next >= estimate) return estimate;
    estimate = next;
  }
}

/**
 * One line of the extended Euclidean algorithm, exactly as written by hand:
 *
 *     dividend = quotient × divisor + remainder
 *
 * together with the running coefficient t, which satisfies t × value ≡ remainder (mod m)
 * at every line. When the remainder reaches 1, its t is the inverse.
 */
export interface EuclidStep {
  /** The larger number of this line (the previous divisor). */
  dividend: bigint;
  /** The number being divided by (the previous remainder). */
  divisor: bigint;
  /** Whole part of dividend ÷ divisor. */
  quotient: bigint;
  /** What is left over: dividend − quotient × divisor. */
  remainder: bigint;
  /** Coefficient that belongs to the dividend. */
  tDividend: bigint;
  /** Coefficient that belongs to the divisor. */
  tDivisor: bigint;
  /** Coefficient for the remainder: tDividend − quotient × tDivisor. */
  tRemainder: bigint;
}

/** Everything needed to show how an inverse was found (or why there is none). */
export interface InverseTrace {
  /** The value to invert, already reduced into 0 … modulus − 1. */
  value: bigint;
  /** The modulus m. */
  modulus: bigint;
  /** The division lines, in order. The last line has remainder 0. */
  steps: EuclidStep[];
  /** gcd(value, modulus). An inverse exists only when this is 1. */
  gcd: bigint;
  /** The inverse in 0 … modulus − 1, or null when gcd ≠ 1. */
  inverse: bigint | null;
}

/**
 * Run the extended Euclidean algorithm and keep every line.
 *
 * Formula: start with r₀ = m, r₁ = value, t₀ = 0, t₁ = 1 and repeat
 *     qᵢ = ⌊rᵢ₋₁ / rᵢ⌋,   rᵢ₊₁ = rᵢ₋₁ − qᵢ·rᵢ,   tᵢ₊₁ = tᵢ₋₁ − qᵢ·tᵢ
 * until the remainder is 0. The last non-zero remainder is gcd(value, m); if it is 1,
 * its t (reduced mod m) is value⁻¹.
 *
 * @param value - the number to invert; any integer, reduced mod m first.
 * @param modulus - the modulus m, must be positive.
 * @returns the trace with all lines, the gcd and the inverse (null if none exists).
 * @throws EccError('BAD_ARGUMENT') when the modulus is not positive.
 */
export function inverseTrace(value: bigint, modulus: bigint): InverseTrace {
  const reduced = mod(value, modulus);
  const steps: EuclidStep[] = [];

  let dividend = modulus;
  let divisor = reduced;
  let tDividend = 0n;
  let tDivisor = 1n;

  while (divisor !== 0n) {
    const quotient = dividend / divisor;
    const remainder = dividend - quotient * divisor;
    const tRemainder = tDividend - quotient * tDivisor;
    steps.push({ dividend, divisor, quotient, remainder, tDividend, tDivisor, tRemainder });
    dividend = divisor;
    divisor = remainder;
    tDividend = tDivisor;
    tDivisor = tRemainder;
  }

  // After the loop `dividend` holds the last non-zero remainder, which is the gcd, and
  // `tDividend` is the coefficient that goes with it.
  const gcd = dividend;
  const inverse = gcd === 1n ? mod(tDividend, modulus) : null;
  return { value: reduced, modulus, steps, gcd, inverse };
}

/**
 * Modular inverse without recording steps (the fast path used inside loops).
 *
 * Formula: the x with value · x ≡ 1 (mod m), found by the extended Euclidean algorithm.
 *
 * @param value - the number to invert; any integer.
 * @param modulus - the modulus m, must be positive.
 * @returns value⁻¹ in the range 0 … m − 1.
 * @throws EccError('NO_INVERSE') when gcd(value, m) ≠ 1, for example when value ≡ 0.
 */
export function modInverse(value: bigint, modulus: bigint): bigint {
  let dividend = modulus;
  let divisor = mod(value, modulus);
  let tDividend = 0n;
  let tDivisor = 1n;
  while (divisor !== 0n) {
    const quotient = dividend / divisor;
    [dividend, divisor] = [divisor, dividend - quotient * divisor];
    [tDividend, tDivisor] = [tDivisor, tDividend - quotient * tDivisor];
  }
  if (dividend !== 1n) {
    throw new EccError(
      'NO_INVERSE',
      `${mod(value, modulus)} has no inverse modulo ${modulus} because they share the factor ${dividend}.`,
    );
  }
  return mod(tDividend, modulus);
}

/**
 * The first 24 primes. They serve two jobs in {@link isPrime}: quick trial division, and
 * the fixed bases of the Miller-Rabin test.
 */
const SMALL_PRIMES: readonly bigint[] = [
  2n,
  3n,
  5n,
  7n,
  11n,
  13n,
  17n,
  19n,
  23n,
  29n,
  31n,
  37n,
  41n,
  43n,
  47n,
  53n,
  59n,
  61n,
  67n,
  71n,
  73n,
  79n,
  83n,
  89n,
];

/**
 * Below this value the Miller-Rabin test with the first 13 prime bases is proven to make
 * no mistakes (Sorenson and Webster, 2015). We use 24 bases, which includes those 13.
 */
export const PRIMALITY_PROVEN_BELOW = 3_317_044_064_679_887_385_961_981n;

/**
 * Test whether `n` is prime.
 *
 * Method: trial division by the first 24 primes, then the Miller-Rabin test with those
 * same primes as bases. Write n − 1 = d · 2ˢ with d odd. For each base a, n passes if
 * a^d ≡ 1, or a^(d·2ʳ) ≡ −1 for some 0 ≤ r < s (mod n). A prime passes for every base.
 *
 * The answer is proven correct for n below {@link PRIMALITY_PROVEN_BELOW} (about
 * 3.3 × 10²⁴). Above that it is a probabilistic test: a composite number would have to
 * fool all 24 bases, with a chance below 4⁻²⁴ per number, and no such number is known.
 *
 * @param n - any integer.
 * @returns true when n is prime (see the note above for very large n).
 */
export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (const prime of SMALL_PRIMES) {
    if (n === prime) return true;
    if (n % prime === 0n) return false;
  }

  // n is odd and larger than 89 here. Split n − 1 into d · 2^s with d odd.
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s += 1;
  }

  nextBase: for (const base of SMALL_PRIMES) {
    let x = modPow(base, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let round = 1; round < s; round += 1) {
      x = (x * x) % n;
      if (x === n - 1n) continue nextBase;
    }
    return false; // this base proves n is composite
  }
  return true;
}

/**
 * Look for a small factor of `n`, to make "not prime" messages helpful (21 = 3 × 7).
 *
 * @param n - an integer ≥ 2.
 * @param limit - largest divisor to try; keeps the search instant.
 * @returns the smallest factor f with 1 < f < n and f ≤ limit, or null if none is found.
 */
export function findSmallFactor(n: bigint, limit = 100_000n): bigint | null {
  if (n < 4n) return null;
  if (n % 2n === 0n) return 2n;
  for (let candidate = 3n; candidate <= limit && candidate * candidate <= n; candidate += 2n) {
    if (n % candidate === 0n) return candidate;
  }
  return null;
}

/**
 * Euler's criterion: decide whether `n` is a square modulo the odd prime `p`.
 *
 * Formula: n^((p − 1)/2) mod p is 1 when n is a non-zero square (a quadratic residue),
 * p − 1 when it is not, and 0 when n ≡ 0.
 *
 * @param n - any integer.
 * @param p - an odd prime.
 * @returns 1 for a non-zero square, −1 for a non-square, 0 when n ≡ 0 (mod p).
 */
export function legendreSymbol(n: bigint, p: bigint): 1 | 0 | -1 {
  const value = modPow(n, (p - 1n) / 2n, p);
  if (value === 0n) return 0;
  return value === 1n ? 1 : -1;
}

/** The parts of Tonelli-Shanks that depend only on p, not on the number being rooted. */
interface TonelliSetup {
  p: bigint;
  /** Odd part of p − 1. */
  q: bigint;
  /** Power of two in p − 1, so p − 1 = q · 2ˢ. */
  s: number;
  /** z^q mod p for a fixed non-square z. */
  zToQ: bigint;
}

/**
 * Setup for the most recently used prime. Listing a curve takes thousands of square
 * roots for the same p, and searching for a non-square each time would dominate the
 * running time, so the last answer is remembered. It is only a speed-up: the result of
 * {@link sqrtMod} does not depend on it.
 */
let lastTonelliSetup: TonelliSetup | null = null;

/**
 * Split p − 1 = q · 2ˢ and find a non-square z, once per prime.
 *
 * @param p - an odd prime.
 * @returns q, s and z^q mod p.
 */
function tonelliSetup(p: bigint): TonelliSetup {
  if (lastTonelliSetup !== null && lastTonelliSetup.p === p) return lastTonelliSetup;

  let q = p - 1n;
  let s = 0;
  while ((q & 1n) === 0n) {
    q >>= 1n;
    s += 1;
  }

  // Any non-square works as z. Half of all values are non-squares, so this is quick.
  let z = 2n;
  while (legendreSymbol(z, p) !== -1) z += 1n;

  lastTonelliSetup = { p, q, s, zToQ: modPow(z, q, p) };
  return lastTonelliSetup;
}

/**
 * Square root modulo an odd prime by the Tonelli-Shanks algorithm.
 *
 * Finds r with r² ≡ n (mod p). Steps:
 *  1. Euler's criterion tells whether a root exists at all.
 *  2. If p ≡ 3 (mod 4) the root is simply n^((p + 1)/4).
 *  3. Otherwise write p − 1 = q · 2ˢ with q odd, pick any non-square z, and start from
 *     r = n^((q + 1)/2), t = n^q, c = z^q. While t ≠ 1, find the smallest i with
 *     t^(2ⁱ) = 1, set b = c^(2^(m − i − 1)) and update r = r·b, c = b², t = t·c, m = i.
 *     Each round shrinks the order of t, so the loop ends with r² ≡ n.
 *
 * @param n - any integer; reduced mod p first.
 * @param p - an odd prime.
 * @returns the smaller of the two roots r and p − r, or null when n is not a square.
 */
export function sqrtMod(n: bigint, p: bigint): bigint | null {
  const value = mod(n, p);
  if (value === 0n) return 0n;
  if (legendreSymbol(value, p) !== 1) return null;

  let root: bigint;
  if (p % 4n === 3n) {
    root = modPow(value, (p + 1n) / 4n, p);
  } else {
    const { q, s, zToQ } = tonelliSetup(p);
    let m = s;
    let c = zToQ;
    let t = modPow(value, q, p);
    root = modPow(value, (q + 1n) / 2n, p);

    while (t !== 1n) {
      // Smallest i (0 < i < m) with t^(2^i) ≡ 1.
      let i = 0;
      let power = t;
      while (power !== 1n) {
        power = (power * power) % p;
        i += 1;
      }
      const b = modPow(c, 1n << BigInt(m - i - 1), p);
      m = i;
      c = (b * b) % p;
      t = (t * c) % p;
      root = (root * b) % p;
    }
  }

  // Both r and p − r are roots. Returning the smaller one makes the output predictable.
  const other = p - root;
  return root < other ? root : other;
}
