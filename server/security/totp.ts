/**
 * Two-factor authentication with an authenticator app (TOTP, RFC 6238): 6-digit codes
 * that change every 30 seconds, computed from a secret shared once through a QR code.
 * Uses the `otpauth` library for the codes and `qrcode` for the picture.
 */
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';

/** Name shown in the authenticator app. */
const ISSUER = 'OnCurve';
/** Seconds each code is valid for. */
const PERIOD = 30;

/** Build the TOTP generator for one account. */
function generator(secret: string, label: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

/**
 * Create a new secret (160 random bits) and everything needed to add it to an app.
 *
 * @param label - the account name shown in the app (the email).
 * @returns the secret in base32, the otpauth:// link, and the QR code as an SVG picture.
 */
export async function createTotpSecret(
  label: string,
): Promise<{ secret: string; uri: string; qrSvg: string }> {
  const secret = new Secret({ size: 20 }).base32;
  const uri = generator(secret, label).toString();
  const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { secret, uri, qrSvg };
}

/**
 * Check a code from the app. One step either side is accepted, to allow for a clock that
 * is a little off; a step that was already used is refused, so a code cannot be replayed.
 *
 * @param secret - the account's base32 secret.
 * @param code - the 6 digits typed by the user.
 * @param lastStep - the time step of the last accepted code, if any.
 * @param now - the current time in milliseconds (injectable for tests).
 * @returns the accepted time step, or null when the code is wrong or already used.
 */
export function checkTotp(
  secret: string,
  code: string,
  lastStep: number | null,
  now = Date.now(),
): number | null {
  const token = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return null;
  const delta = generator(secret, 'check').validate({ token, timestamp: now, window: 1 });
  if (delta === null) return null;
  const step = Math.floor(now / 1000 / PERIOD) + delta;
  if (lastStep !== null && step <= lastStep) return null;
  return step;
}

/**
 * The code an app would show right now (used by the tests and the demo seed only).
 *
 * @param secret - base32 secret.
 * @param now - time in milliseconds.
 * @returns the 6-digit code.
 */
export function currentTotp(secret: string, now = Date.now()): string {
  return generator(secret, 'demo').generate({ timestamp: now });
}
