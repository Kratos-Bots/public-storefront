import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const order = {
  reference: 'NB-1001',
  totalAmount: 25,
  outstandingBalance: 10,
  createdAt: '2026-01-02T10:00:00Z',
  status: 'pending',
  subtotal: 20,
  shippingAmount: 5,
  discountAmount: 0,
  items: [],
  payments: [],
  shipments: [],
};

vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply', links: {} } }) }));
vi.mock('@/features/account/queries.ts', () => ({
  useOrders: () => ({
    data: { pages: [{ data: [order], meta: { totalItems: 1 } }] },
    isPending: false, isError: false, hasNextPage: false, isFetchingNextPage: false,
  }),
  useOrder: () => ({ data: order, isPending: false, isError: false }),
}));

import { OrdersPage } from '@/features/account/OrdersPage.tsx';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import { Money } from '@/components/Money.tsx';
import { formatDate } from '@/lib/format.ts';

afterEach(cleanup);
const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test"><MemoryRouter>{ui}</MemoryRouter></MantineProvider>
    </QueryClientProvider>,
  );

describe('account DOM stays identical to the literal JSX', () => {
  it('order row "Balance due" is a text node followed by the Money element', () => {
    const { container } = wrap(<OrdersPage />);
    const due = [...container.querySelectorAll('a > span')].find((s) => s.textContent?.startsWith('Balance due'))!;
    const ref = render(<span>Balance due <Money amount={10} /></span>).container.firstElementChild!;
    expect(due.innerHTML).toBe(ref.innerHTML);
    expect([...due.childNodes].map((n) => n.nodeType)).toEqual([3, 1]);
    expect(due.childNodes[0]!.textContent).toBe('Balance due ');
  });
  it('order detail "Placed" date is one text run', () => {
    const { container } = wrap(<OrderDetailPage />);
    const el = [...container.querySelectorAll('span')].find((s) => s.textContent?.startsWith('Placed'))!;
    expect(el.textContent).toBe(`Placed ${formatDate(order.createdAt)}`);
    expect(el.children.length).toBe(0);
  });
});
