/**
 * The account page: "My work" (saved items and history) and the Security center. Guests
 * are sent to the sign-in page.
 */
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button } from '../components/ui/Button.tsx';
import { Callout } from '../components/ui/Callout.tsx';
import { TabPanel, Tabs, type TabItem } from '../components/ui/Tabs.tsx';
import { MyWork } from '../features/account/MyWork.tsx';
import { SecurityCenter } from '../features/account/SecurityCenter.tsx';
import { useAuth } from '../features/auth/AuthContext.tsx';
import { usePageTitle } from '../lib/usePageTitle.ts';

type AccountTab = 'work' | 'security';

const TABS: ReadonlyArray<TabItem<AccountTab>> = [
  { id: 'work', label: 'My work', icon: 'save' },
  { id: 'security', label: 'Security', icon: 'shield' },
];

/** The account page. */
export function AccountPage() {
  usePageTitle('Account');
  const { status, user, signOut, recoveryCodesLeft } = useAuth();
  const location = useLocation();
  const recovered = (location.state as { recovered?: boolean } | null)?.recovered === true;
  const [tab, setTab] = useState<AccountTab>(recovered ? 'security' : 'work');

  if (status === 'loading') return null;
  if (!user) return <Navigate to="/signin" replace />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Your account</h1>
          <p className="mt-1 text-muted" data-testid="account-email">
            Signed in as <strong className="font-semibold text-ink-soft">{user.email}</strong>
            {' · '}member since{' '}
            {new Date(user.createdAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
          </p>
        </div>
        <Button icon="logout" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>

      {recovered && (
        <Callout tone="success" title="Your password was reset" role="status">
          You have {recoveryCodesLeft ?? 'fewer'} recovery codes left. Consider creating a fresh set
          below.
        </Callout>
      )}

      <div className="max-w-md">
        <Tabs
          items={TABS}
          active={tab}
          onChange={setTab}
          idPrefix="account"
          label="Account sections"
        />
      </div>
      <TabPanel idPrefix="account" id="work" active={tab === 'work'}>
        <MyWork />
      </TabPanel>
      <TabPanel idPrefix="account" id="security" active={tab === 'security'}>
        <SecurityCenter />
      </TabPanel>
    </div>
  );
}
