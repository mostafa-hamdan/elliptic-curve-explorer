/**
 * Loads the local settings file `.env` into `process.env` at start-up, and gives the rest
 * of the server one typed place to read its settings from.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Path of the local settings file. Built from this file's location, so spaces are fine. */
export const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));

/**
 * Read `.env` if it exists. Values already set in the real environment win, which is how
 * a hosting platform overrides the local file. Uses Node's own loader (no dependency).
 */
export function loadEnvFile(): void {
  if (!existsSync(ENV_PATH)) return;
  const before = { ...process.env };
  process.loadEnvFile(ENV_PATH);
  // Node's loader overwrites existing values; put back anything that was set before.
  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value;
  }
}

/**
 * An optional setting: the value, or undefined when it is missing or blank.
 *
 * @param name - the environment variable.
 * @returns the trimmed value, or undefined.
 */
export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
