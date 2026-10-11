import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The real order query (not a stub), so `isFetching`, `isStale` and `isFetchedAfterMount` are the ones a shopper gets.
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply', links: {} }, supportLinks: [], reviews: { enabled: true, maxLength: 500 } }),
}));
vi.mock('@/api/orders.ts', async (orig) => ({ ...(await orig<typeof import('@/api/orders.ts')>()), fetchOrder: vi.fn(), fetchOrderPayment: vi.fn() }));

import { fetchOrder } from '@/api/orders.ts';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import type { OrderDetail } from '@/types/orders.ts';

const fetchMock = vi.mocked(fetchOrder);

const order = (canReview: boolean): OrderDetail => ({
  reference: 'K4M2QP', totalAmount: 46.03, outstandingBalance: 0, createdAt: '2026-01-02T10:00:00Z', status: 'delivered',
  subtotal: 40, shippingAmount: 6.03, discountAmount: 0, items: [{ name: 'Oat Bar', quantity: 1, unitPrice: 4, lineTotal: 4 }], payments: [], shipments: [],
  review: { canReview, existing: null },
});

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}
const mount = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={['/account/orders/K4M2QP?review=1']}>
          <Routes><Route path="/account/orders/:ref" element={<OrderDetailPage />} /></Routes>
          <Where />
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
const clientWith = (staleTime: number) => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } });
const param = () => screen.getByTestId('where').textContent!.includes('review=1');
const firstStar = () => screen.getAllByRole('radio')[0];

beforeEach(() => {
  fetchMock.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('?review=1 against the real order query', () => {
  it('a copy fetched moments ago (a quick second visit, no mount fetch) is acted on at once: focus, one scroll, param gone', async () => {
    const client = clientWith(10_000);
    client.setQueryData(['order', 'K4M2QP'], order(true));
    mount(client);
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(document.activeElement).toBe(firstStar()));
    await waitFor(() => expect(param()).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('a stale copy without canReview: the param waits for the refetch, which grants it, then acts exactly once', async () => {
    const client = clientWith(0);
    client.setQueryData(['order', 'K4M2QP'], order(false));
    let answer: (v: OrderDetail) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    mount(client);
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(param()).toBe(true);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await act(async () => { answer(order(true)); });
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(document.activeElement).toBe(firstStar()));
    await waitFor(() => expect(param()).toBe(false));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a stale copy whose refetch still denies a review: the param is dropped silently, nothing scrolls or focuses', async () => {
    const client = clientWith(0);
    client.setQueryData(['order', 'K4M2QP'], order(false));
    fetchMock.mockResolvedValue(order(false));
    mount(client);
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    await waitFor(() => expect(param()).toBe(false));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('no cache at all: the first fetch is fresh, and the form gets the focus', async () => {
    fetchMock.mockResolvedValue(order(true));
    mount(clientWith(10_000));
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(document.activeElement).toBe(firstStar()));
    await waitFor(() => expect(param()).toBe(false));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
