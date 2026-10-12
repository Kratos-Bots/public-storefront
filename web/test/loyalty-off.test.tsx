import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense } from 'react';
import type { Profile, RedeemOptions } from '@/types/profile.ts';

// Loyalty is switched off per customer group: the profile says so and the account hides it.
const s = vi.hoisted(() => ({ profile: undefined as unknown, redeemCalls: 0 }));
vi.mock('@/api/profile.ts', () => ({
  fetchProfile: async () => s.profile,
  fetchRedeemOptions: async () => { s.redeemCalls += 1; return { loyaltyPoints: 1250, options: [] }; },
  redeem: async () => ({}),
  setBotMode: async () => ({ classic: true }),
  setReferralCode: async () => ({ referrerNickname: 'Grace' }),
}));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: () => false }));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => 'storefront' }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    telegramWebApp: { mode: 'off' }, features: { layout: 'storefront', ordering: true, accounts: true },
  }),
}));

import { AccountLayout } from '@/features/account/AccountLayout.tsx';
import { LoyaltyPage, LOYALTY_VIEWS } from '@/features/account/LoyaltyPage.tsx';
import { ReferralsPage } from '@/features/account/ReferralsPage.tsx';
import { LoyaltyFamily } from '@/builder/family-loyalty.ts';
import { loyaltyOn } from '@/types/profile.ts';

afterEach(cleanup);

const PROFILE: Profile = {
  loyaltyPoints: 1250, storeCreditBalance: 7.5, referralCode: 'NORTH-4F2A', referralsCount: 3, referredPeopleCount: 2,
  hasReferrer: false, referrerNickname: null, totalOrders: 4, totalSpend: 182.4, memberSince: '2026-03-04T12:00:00.000Z',
  nickname: 'Ada', identities: { telegram: true, whatsapp: false, email: true },
};
const LADDER: RedeemOptions = { loyaltyPoints: 1250, options: [] };

beforeEach(() => { s.profile = PROFILE; s.redeemCalls = 0; });

function mount(path: string, element: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[path]}>
          <Suspense fallback={null}>{element}</Suspense>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

function account() {
  return (
    <Routes>
      <Route path="/account" element={<AccountLayout />}>
        <Route path="orders" element={<p>orders page</p>} />
        <Route path="loyalty" element={<LoyaltyPage />} />
        <Route path="referrals" element={<ReferralsPage />} />
      </Route>
    </Routes>
  );
}

// Mantine injects <style> tags next to whatever is rendered; only real elements count.
const shown = (c: HTMLElement) => c.querySelectorAll(':scope > :not(style)').length;
const hrefs = (c: HTMLElement) => [...c.querySelectorAll('a')].map((a) => a.getAttribute('href'));

describe('loyaltyOn', () => {
  it('is on unless the backend says false', () => {
    expect(loyaltyOn(undefined)).toBe(true);
    expect(loyaltyOn(null)).toBe(true);
    expect(loyaltyOn({})).toBe(true);
    expect(loyaltyOn({ loyaltyEnabled: true })).toBe(true);
    expect(loyaltyOn({ loyaltyEnabled: false })).toBe(false);
  });
});

describe('the account rail', () => {
  it.each([
    ['loyaltyEnabled true', { loyaltyEnabled: true }],
    ['the field absent (older backend)', {}],
  ])('shows the loyalty tab with %s', async (_n, extra) => {
    s.profile = { ...PROFILE, ...extra };
    const { container } = mount('/account/orders', account());
    await waitFor(() => expect(container.querySelector('nav')).not.toBeNull());
    expect(hrefs(container)).toContain('/account/loyalty');
  });

  it('hides the loyalty tab when loyaltyEnabled is false and keeps the others', async () => {
    s.profile = { ...PROFILE, loyaltyEnabled: false };
    const { container } = mount('/account/orders', account());
    await waitFor(() => expect(hrefs(container)).not.toContain('/account/loyalty'));
    expect(hrefs(container)).toEqual(expect.arrayContaining(['/account/orders', '/account/referrals', '/account/profile']));
  });
});

describe('the loyalty page', () => {
  it('redirects /account/loyalty to /account/orders when loyaltyEnabled is false', async () => {
    s.profile = { ...PROFILE, loyaltyEnabled: false };
    mount('/account/loyalty', account());
    expect(await screen.findByText('orders page')).toBeTruthy();
  });

  it('does not request redeem options when loyaltyEnabled is false', async () => {
    s.profile = { ...PROFILE, loyaltyEnabled: false };
    mount('/account/loyalty', account());
    await screen.findByText('orders page');
    expect(s.redeemCalls).toBe(0);
  });

  it('requests redeem options when loyalty is on', async () => {
    mount('/account/loyalty', account());
    await waitFor(() => expect(s.redeemCalls).toBe(1));
  });
});

describe('the loyalty blocks', () => {
  const names = Object.keys(LOYALTY_VIEWS);
  const host = (loyaltyEnabled: boolean | undefined, points = 1250) => (
    <LoyaltyFamily.Provider
      value={{
        data: { profile: { ...PROFILE, loyaltyPoints: points, ...(loyaltyEnabled === undefined ? {} : { loyaltyEnabled }) }, options: LADDER, points, confirm: () => {}, redeeming: false },
        views: LOYALTY_VIEWS,
      }}
    >
      {names.map((n) => <LoyaltyFamily.PartHost key={n} name={n} props={{}} />)}
    </LoyaltyFamily.Provider>
  );

  it('render nothing when loyaltyEnabled is false', () => {
    const { container } = mount('/', host(false, 0));
    expect(shown(container)).toBe(0);
  });

  it('still render when loyaltyEnabled is true or absent', () => {
    expect(shown(mount('/', host(true)).container)).toBeGreaterThan(0);
    cleanup();
    expect(shown(mount('/', host(undefined)).container)).toBeGreaterThan(0);
  });
});

describe('the referrals page', () => {
  it('keeps the enter-a-code form but drops the share-your-code part when loyalty is off', async () => {
    s.profile = { ...PROFILE, loyaltyEnabled: false };
    const { container } = mount('/account/referrals', account());
    await waitFor(() => expect(container.querySelector('input')).not.toBeNull());
    expect(container.textContent).not.toContain('NORTH-4F2A');
  });

  it('shows the code when loyalty is on', async () => {
    const { container } = mount('/account/referrals', account());
    await waitFor(() => expect(container.textContent).toContain('NORTH-4F2A'));
  });
});
