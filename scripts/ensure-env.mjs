/**
 * Creates the local settings file `.env` if it does not exist yet, filling in a freshly
 * generated session secret. An existing `.env` is never overwritten, so a key the user
 * has added stays where it is. Run by `npm run setup` and by `npm start`.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const examplePath = fileURLToPath(new URL('../.env.example', import.meta.url));

if (existsSync(envPath)) {
  console.info('.env already exists; it was left unchanged.');
} else {
  // 32 random bytes from the operating system's secure generator: 256 bits of secret.
  const secret = randomBytes(32).toString('base64url');
  const template = existsSync(examplePath) ? readFileSync(examplePath, 'utf8') : '';
  const content = template.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`);
  writeFileSync(
    envPath,
    content.includes('SESSION_SECRET=') ? content : `SESSION_SECRET=${secret}\n`,
    {
      encoding: 'utf8',
      // Readable by this user only, where the file system supports it.
      mode: 0o600,
    },
  );
  console.info('Created .env with a new random session secret.');
}
