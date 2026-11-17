/**
 * Small wrappers around Node's built-in `crypto` module: random tokens, keyed hashes,
 * constant-time comparison, and encryption of authenticator secrets at rest. Nothing here
 * invents an algorithm; each function only names a standard one and its parameters.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * A random token from the operating system's secure generator.
 *
 * @param bytes - how many random bytes (32 bytes = 256 bits).
 * @returns the token in URL-safe base64.
 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Keyed hash: HMAC-SHA-256(secret, value). Used to store session tokens and recovery codes
 * so that a copy of the database alone does not reveal them.
 *
 * @param secret - the server secret.
 * @param value - the token or code.
 * @returns the hash as hexadecimal text.
 */
export function keyedHash(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/**
 * Compare two strings in constant time, so the time taken does not reveal how many
 * leading characters matched.
 *
 * @param a - first string.
 * @param b - second string.
 * @returns true when they are equal.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Derive the 256-bit key for encrypting authenticator secrets from the server secret,
 * with HKDF-SHA-256 and a fixed purpose label (so this key is used for nothing else).
 */
function secretBoxKey(serverSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', serverSecret, 'oncurve', 'totp-secret-v1', 32));
}

/**
 * Encrypt a short secret with AES-256-GCM (authenticated encryption).
 *
 * @param serverSecret - the server secret the key is derived from.
 * @param plaintext - the value to protect.
 * @returns "iv.ciphertext.tag", each part in base64url.
 */
export function seal(serverSecret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretBoxKey(serverSecret), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, body, cipher.getAuthTag()].map((part) => part.toString('base64url')).join('.');
}

/**
 * Decrypt a value made by {@link seal}.
 *
 * @param serverSecret - the same server secret.
 * @param sealed - the "iv.ciphertext.tag" text.
 * @returns the original value.
 * @throws when the text was changed or the secret is different.
 */
export function open(serverSecret: string, sealed: string): string {
  const [iv, body, tag] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !body || !tag) throw new Error('Damaged encrypted value.');
  const decipher = createDecipheriv('aes-256-gcm', secretBoxKey(serverSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

/** Characters for recovery codes: no 0/O, 1/I/L, so they are easy to read and type. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * A recovery code such as "K7QM2-XRT9C": 10 random characters from a 31-letter alphabet,
 * about 49 bits, chosen without bias by rejecting bytes above the largest multiple of 31.
 *
 * @returns the code, with a hyphen in the middle for readability.
 */
export function recoveryCode(): string {
  const chars: string[] = [];
  const limit = 256 - (256 % CODE_ALPHABET.length);
  while (chars.length < 10) {
    for (const byte of randomBytes(16)) {
      if (byte < limit && chars.length < 10)
        chars.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]!);
    }
  }
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

/**
 * Normalize a typed recovery code: upper case, without spaces or hyphens.
 *
 * @param code - what the user typed.
 * @returns the code in the form it is hashed in.
 */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}
