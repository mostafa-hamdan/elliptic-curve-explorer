/**
 * The Security page: how OnCurve protects accounts, in plain words, one card per
 * protection. The technical details are in SECURITY.md in the repository.
 */
import type { ReactNode } from 'react';
import { Callout } from '../components/ui/Callout.tsx';
import { Card } from '../components/ui/Card.tsx';
import { Icon, type IconName } from '../components/ui/Icon.tsx';
import { usePageTitle } from '../lib/usePageTitle.ts';

interface Protection {
  icon: IconName;
  title: string;
  body: ReactNode;
}

/** The protections, roughly in the order a visitor meets them. */
const PROTECTIONS: Protection[] = [
  {
    icon: 'lock',
    title: 'Passwords are never stored',
    body: 'Only an Argon2id hash is kept, with its own random salt. Argon2id is deliberately slow and memory-hungry, so even a stolen copy of the database is very costly to attack. Passwords are never written to any log.',
  },
  {
    icon: 'check',
    title: 'Strong passwords only',
    body: 'A password needs at least 12 characters, must not be one of about 49,000 commonly used passwords, and must not be too easy to guess. The meter on the form uses the same rules as the server.',
  },
  {
    icon: 'shield',
    title: 'Two-factor authentication',
    body: 'You can require a 6-digit code from an authenticator app at every sign-in. The shared secret is stored encrypted (AES-256-GCM), and each code works only once.',
  },
  {
    icon: 'reset',
    title: 'Recovery codes instead of email',
    body: 'OnCurve never sends email. Ten one-time recovery codes, shown once when the account is created, let you reset a lost password or replace a lost phone. Only their hashes are stored.',
  },
  {
    icon: 'user',
    title: 'Sessions you control',
    body: 'Signing in sets a random 256-bit token in a cookie that page scripts cannot read and other sites cannot send. A session ends after 2 hours of inactivity or 7 days at most. The Security center lists every signed-in browser and can sign any or all of them out.',
  },
  {
    icon: 'alert',
    title: 'Guessing is slowed down',
    body: 'After five wrong passwords an account is locked for 15 minutes, whether or not it exists, so a lockout reveals nothing. Each network address also has limits on sign-ins and new accounts. Wrong email and wrong password get the same message.',
  },
  {
    icon: 'target',
    title: 'Forged requests are refused',
    body: 'Every request that changes something must carry a secret token that only this site’s own pages can read (protection against cross-site request forgery).',
  },
  {
    icon: 'grid',
    title: 'Strict browser rules',
    body: 'The site tells the browser to run only its own scripts (Content-Security-Policy), never to show it inside another site’s frame, not to guess file types, and not to pass on the address of the page. When hosted, the browser must always use HTTPS.',
  },
  {
    icon: 'list',
    title: 'Your data is yours',
    body: 'Every database query is limited to the signed-in account, so no account can read another’s data. Delete my account removes the account and everything in it. There is no analytics and no tracking.',
  },
];

/** The Security page. */
export function SecurityPage() {
  usePageTitle('Security');
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Security</h1>
      <p className="mt-1 max-w-3xl text-muted">
        How OnCurve protects your account. An account is optional: every calculation works without
        one, and nothing you calculate is sent anywhere unless you are signed in.
      </p>

      <Callout tone="warning" title="A learning tool, not a vault" className="mt-5">
        The protections below guard your OnCurve account. The elliptic curve calculations themselves
        are written for teaching, not to resist attacks: never use this app to create or protect
        real keys or secrets.
      </Callout>

      <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="protections">
        {PROTECTIONS.map((item) => (
          <li key={item.title} className="min-w-0">
            <Card className="h-full p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon name={item.icon} size={18} />
              </span>
              <h2 className="mt-3 text-base font-semibold text-ink">{item.title}</h2>
              <p className="mt-1.5 text-sm text-ink-soft">{item.body}</p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
