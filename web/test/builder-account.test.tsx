import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/features/account/queries.ts', () => ({
  useProfile: () => ({ data: undefined, isPending: true, isError: false }),
  useOrders: () => ({ data: undefined, isPending: true, isError: false }),
  useOrder: () => ({ data: undefined, isPending: true, isError: false }),
  useRedeemOptions: () => ({ data: undefined, isPending: true, isError: false }),
}));
vi.mock('@/features/account/OrdersPage.tsx', () => ({ OrdersPage: () => <p>orders page</p> }));
vi.mock('@/features/account/OrderDetailPage.tsx', () => ({ OrderDetailPage: () => <p>order detail page</p> }));
vi.mock('@/features/account/LoyaltyPage.tsx', () => ({ LoyaltyPage: () => <p>loyalty page</p> }));
vi.mock('@/features/account/ReferralsPage.tsx', () => ({ ReferralsPage: () => <p>referrals page</p> }));
vi.mock('@/features/account/ProfilePage.tsx', () => ({ ProfilePage: () => <p>profile page</p> }));

import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { AccountLayout } from '@/features/account/AccountLayout.tsx';
import { SETTINGS_KEY } from '@/lib/query-client.ts';
import type { FixedRouteKey } from '@/builder/types.ts';

function mountAt(element: ReactNode, path = '/account/orders', settings: Record<string, unknown> = {}) {
  const router = createMemoryRouter([{ path: '/account', element, children: [{ path: '*', element: <p>body</p> }] }], { initialEntries: [path] });
  // The account rail asks the settings whether the shop has reviews (a link appears only then).
  const client = new QueryClient();
  client.setQueryData(SETTINGS_KEY, settings);
  return render(<QueryClientProvider client={client}><MantineProvider env="test"><Suspense fallback={null}><RouterProvider router={router} /></Suspense></MantineProvider></QueryClientProvider>);
}
const normalize = (html: string) => html.replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID');

afterEach(cleanup);

describe('AccountNav', () => {
  it('wraps its body exactly where the v0.6.0 outlet was', () => {
    const legacy = normalize(mountAt(<AccountLayout />).container.innerHTML);
    cleanup();
    const withChildren = normalize(mountAt(<AccountLayout><p>body</p></AccountLayout>).container.innerHTML);
    expect(withChildren).toBe(legacy);
  });
  it('has the four sections and no Reviews tab, even while the shop has reviews on (they live in the shop menu and on each order)', () => {
    mountAt(<AccountLayout />, '/account/orders', { reviews: { enabled: true, maxLength: 500 } });
    const rail = within(screen.getByRole('navigation', { name: 'Account sections' }));
    expect(rail.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/account/orders', '/account/loyalty', '/account/referrals', '/account/profile']);
    expect(rail.queryByRole('link', { name: /review/i })).toBeNull();
  });
  it.each<[FixedRouteKey, string]>([
    ['account.orders', 'orders page'], ['account.order', 'order detail page'], ['account.loyalty', 'loyalty page'],
    ['account.referrals', 'referrals page'], ['account.profile', 'profile page'],
  ])('%s default renders its page inside the account rail', async (key, text) => {
    const doc = defaultDoc(key, 'storefront')!;
    expect(doc.content[0]!.props.id).toBe('AccountNav-default');
    mountAt(<RenderDoc doc={doc} docKey={key} layout="storefront" />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Account sections' })).toBeInTheDocument();
  });
});
