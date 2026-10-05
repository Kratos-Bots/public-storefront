import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ links: [] as Array<{ label: string; url: string }> }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply', links: {} }, supportLinks: h.links }),
}));
// The real useOrder runs here: the card reads the state of that query to know whether its refetch has settled.
vi.mock('@/api/orders.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/orders.ts')>()),
  fetchOrder: vi.fn(),
  fetchOrderPayment: vi.fn(),
  fetchOrderPaymentOptions: vi.fn(),
}));

import { fetchOrder, fetchOrderPayment, fetchOrderPaymentOptions } from '@/api/orders.ts';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import type { PublicOrder } from '@/types/public-order.ts';

const orderMock = vi.mocked(fetchOrder);
const paymentMock = vi.mocked(fetchOrderPayment);

const owing = {
  reference: 'K4M2QP', totalAmount: 46.03, outstandingBalance: 46.03, createdAt: '2026-01-02T10:00:00Z', status: 'pending',
  subtotal: 40, shippingAmount: 6.03, discountAmount: 0, items: [], payments: [], shipments: [],
  canCancel: false, cancelBlockedBy: 'paid',
};
// The payment view is the fresher read: it already says the order was paid.
const paid = (): PublicOrder => ({
  reference: 'K4M2QP', status: 'confirmed', createdAt: '2026-01-02T10:00:00Z', deliveredAt: null, isPreorder: false, currency: 'GBP',
  items: [], totals: { subtotal: 40, shippingAmount: 6.03, discountAmount: 0, taxAmount: 0, totalAmount: 46.03 },
  shippingAddress: null, shipments: [], cryptoPayments: [], payment: { canPay: false, payBy: null, activePayment: null },
});

const UPDATING = 'Updating your order…';
const HELP = /This balance can't be paid online/;

beforeEach(() => {
  vi.restoreAllMocks();
  h.links = [{ label: 'Chat on Telegram', url: 'https://t.me/shop' }];
  orderMock.mockReset();
  paymentMock.mockReset().mockResolvedValue(paid());
  vi.mocked(fetchOrderPaymentOptions).mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={['/account/orders/K4M2QP']}>
          <Routes><Route path="/account/orders/:ref" element={<OrderDetailPage />} /></Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe('"Updating your order…" has an exit', () => {
  it('while the account order refetch is in flight: the neutral line only', async () => {
    orderMock.mockResolvedValueOnce(owing as never).mockReturnValue(new Promise(() => {}));
    mount();
    expect(await screen.findByText(UPDATING)).toBeTruthy();
    await waitFor(() => expect(orderMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText(UPDATING)).toBeTruthy();
    expect(screen.queryByText(HELP)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Chat on Telegram' })).toBeNull();
  });

  it('settled and the account order still says money is owed: the help text and the support links take its place', async () => {
    orderMock.mockResolvedValue(owing as never);
    mount();
    expect(await screen.findByText(HELP)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chat on Telegram' }).getAttribute('href')).toBe('https://t.me/shop');
    expect(screen.queryByText(UPDATING)).toBeNull();
    expect(orderMock).toHaveBeenCalledTimes(2);
  });

  it('the refetch failed: the neutral line stays, with no help text', async () => {
    orderMock.mockResolvedValueOnce(owing as never).mockRejectedValue(new Error('offline'));
    const client = mount();
    await screen.findByText(UPDATING);
    await waitFor(() => expect(orderMock).toHaveBeenCalledTimes(2));
    // The rejected refetch has settled into the query's error state, with the earlier order still cached.
    await waitFor(() => expect(client.getQueryState(['order', 'K4M2QP'])?.status).toBe('error'));
    expect(client.getQueryState(['order', 'K4M2QP'])?.fetchStatus).toBe('idle');
    expect(screen.getByText(UPDATING)).toBeTruthy();
    expect(screen.queryByText(HELP)).toBeNull();
  });
});
