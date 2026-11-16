/**
 * The server's settings, read once from the environment (and the local `.env` file).
 * Secrets live only here, never in the code or in the browser.
 */
import { optionalEnv } from './env.ts';

/** Everything the server needs to know about where and how it runs. */
export interface ServerConfig {
  /** Secret used to hash session tokens and recovery codes and to encrypt 2FA secrets. */
  sessionSecret: string;
  /** True when running on a hosting platform over HTTPS: adds Secure cookies and HSTS. */
  hosted: boolean;
  /** Key for the assistant's AI mode; undefined means the offline helper only. */
  anthropicApiKey: string | undefined;
  /** New accounts allowed per network address per hour. */
  signupsPerHour: number;
  /** Sign-in attempts allowed per network address per 15 minutes. */
  signinsPerWindow: number;
}

/**
 * Read a whole-number setting, falling back to a default when it is missing or not a
 * positive whole number.
 */
function numberSetting(name: string, fallback: number): number {
  const value = Number(optionalEnv(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Shortest acceptable session secret (32 characters of base64 is 192 bits). */
const MIN_SECRET_LENGTH = 32;

/**
 * Read the settings from the environment.
 *
 * @returns the settings.
 * @throws when SESSION_SECRET is missing or too short, with instructions to fix it.
 */
export function loadConfig(): ServerConfig {
  const sessionSecret = optionalEnv('SESSION_SECRET');
  if (!sessionSecret || sessionSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      'SESSION_SECRET is missing or too short. Run "npm run setup" (or "node scripts/ensure-env.mjs") to create it in .env.',
    );
  }
  return {
    sessionSecret,
    hosted: optionalEnv('HOSTED') === '1',
    anthropicApiKey: optionalEnv('ANTHROPIC_API_KEY'),
    signupsPerHour: numberSetting('SIGNUPS_PER_HOUR', 10),
    signinsPerWindow: numberSetting('SIGNINS_PER_IP', 30),
  };
}
