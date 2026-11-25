/**
 * The server's settings, read once from the environment (and the local `.env` file).
 * Secrets live only here, never in the code or in the browser.
 */
import { optionalEnv } from './env.ts';

/** The AI providers the assistant can use. */
export type AiProviderName = 'openai' | 'anthropic';

/** AI questions allowed per day when AI_DAILY_LIMIT is missing or invalid. */
export const DEFAULT_AI_DAILY_LIMIT = 50;

/** Everything the server needs to know about where and how it runs. */
export interface ServerConfig {
  /** Secret used to hash session tokens and recovery codes and to encrypt 2FA secrets. */
  sessionSecret: string;
  /** True when running on a hosting platform over HTTPS: adds Secure cookies and HSTS. */
  hosted: boolean;
  /** Who receives AI questions; null when AI_PROVIDER holds an unknown value (AI mode off). */
  aiProvider: AiProviderName | null;
  /** Key used when the provider is Anthropic; without it, the offline helper only. */
  anthropicApiKey: string | undefined;
  /** Key used when the provider is OpenAI; without it, the offline helper only. */
  openaiApiKey: string | undefined;
  /** The OpenAI model. */
  openaiModel: string;
  /** The OpenAI reasoning effort, or null to leave it to the model. */
  openaiReasoningEffort: string | null;
  /** AI questions allowed per UTC day across all users; 0 turns AI mode off. */
  aiDailyLimit: number;
  /** Protect the shared demo account from security changes (on when hosted). */
  demoLocked: boolean;
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

/**
 * Read AI_PROVIDER. A typo must not send questions to a company nobody chose, so an unknown
 * value turns AI mode off instead of picking one.
 *
 * @returns the provider ("openai" when the setting is empty), or null for an unknown value.
 */
function aiProviderSetting(): AiProviderName | null {
  const value = optionalEnv('AI_PROVIDER')?.toLowerCase() ?? 'openai';
  return value === 'openai' || value === 'anthropic' ? value : null;
}

/**
 * Read AI_DAILY_LIMIT. Unlike the other limits, 0 is meaningful: no AI questions at all.
 *
 * @returns the limit, or the default when the setting is missing or not a whole number.
 */
function aiDailyLimitSetting(): number {
  const text = optionalEnv('AI_DAILY_LIMIT');
  if (text === undefined || !/^\d+$/.test(text)) return DEFAULT_AI_DAILY_LIMIT;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : DEFAULT_AI_DAILY_LIMIT;
}

/**
 * Read OPENAI_REASONING_EFFORT. Any single word is passed on, so a value a future model
 * introduces works without a code change; a value the model refuses is dropped at the first
 * request (see openai.ts). "default" leaves the choice to the model.
 *
 * @returns the effort ("low" when the setting is empty or not a single word), or null.
 */
function reasoningEffortSetting(): string | null {
  const value = optionalEnv('OPENAI_REASONING_EFFORT')?.toLowerCase();
  if (value === 'default') return null;
  return value !== undefined && /^[a-z]{1,20}$/.test(value) ? value : 'low';
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
    aiProvider: aiProviderSetting(),
    anthropicApiKey: optionalEnv('ANTHROPIC_API_KEY'),
    openaiApiKey: optionalEnv('OPENAI_API_KEY'),
    openaiModel: optionalEnv('OPENAI_MODEL') ?? 'gpt-6-luna',
    openaiReasoningEffort: reasoningEffortSetting(),
    aiDailyLimit: aiDailyLimitSetting(),
    demoLocked: optionalEnv('HOSTED') === '1' || optionalEnv('DEMO_ACCOUNT_LOCKED') === '1',
    signupsPerHour: numberSetting('SIGNUPS_PER_HOUR', 10),
    signinsPerWindow: numberSetting('SIGNINS_PER_IP', 30),
  };
}
