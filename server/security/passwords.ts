/**
 * Password hashing with Argon2id, the algorithm recommended by OWASP for storing
 * passwords. Each hash includes its own random salt and its parameters, so it can be
 * checked later without storing anything else. Passwords are never logged.
 */
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id settings: 19 MiB of memory, 2 passes, 1 lane (the OWASP minimum). Memory-hard
 * hashing makes each guess expensive for an attacker with a copy of the database.
 */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/**
 * Hash a password for storage.
 *
 * @param password - the password.
 * @returns the encoded Argon2id hash, salt included.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/**
 * Check a password against a stored hash.
 *
 * @param storedHash - the hash from the database.
 * @param password - the password to check.
 * @returns true when it matches; false for a wrong password or a damaged hash.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

/**
 * A hash of a random password, checked when the email is unknown so that a wrong email
 * takes as long as a wrong password and the timing does not reveal which accounts exist.
 */
let decoyHash: Promise<string> | null = null;

/** The decoy hash, made once on first use. */
export function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(`decoy-${Math.random()}-${Date.now()}`);
  return decoyHash;
}
