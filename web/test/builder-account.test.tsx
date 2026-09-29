import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Suspense, type ReactNode } from 'react';

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
import type { FixedRouteKey } from '@/builder/types.ts';

function mountAt(element: ReactNode, path = '/account/orders') {
  const router = createMemoryRouter([{ path: '/account', element, children: [{ path: '*', element: <p>body</p> }] }], { initialEntries: [path] });
  return render(<MantineProvider env="test"><Suspense fallback={null}><RouterProvider router={router} /></Suspense></MantineProvider>);
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
