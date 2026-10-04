import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ order: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply', links: {} }, supportLinks: [] }),
}));
vi.mock('@/features/account/queries.ts', () => ({
  useOrder: () => ({ data: h.order, isPending: false, isError: false }),
}));
vi.mock('@/api/orders.ts', () => ({ cancelOrder: vi.fn() }));
vi.mock('@/api/public-order.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/public-order.ts')>()),
  fetchPublicOrder: vi.fn(),
  fetchPaymentOptions: vi.fn(),
  selectPaymentMethod: vi.fn(),
}));

import { cancelOrder } from '@/api/orders.ts';
import { fetchPaymentOptions, fetchPublicOrder, selectPaymentMethod } from '@/api/public-order.ts';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import type { PublicOrder } from '@/types/public-order.ts';

const fetchMock = vi.mocked(fetchPublicOrder);
const optionsMock = vi.mocked(fetchPaymentOptions);
const selectMock = vi.mocked(selectPaymentMethod);
const cancelMock = vi.mocked(cancelOrder);

const base = {
  reference: 'K4M2QP', totalAmount: 46.03, outstandingBalance: 46.03, createdAt: '2026-01-02T10:00:00Z', status: 'pending',
  subtotal: 40, shippingAmount: 6.03, discountAmount: 0, items: [], payments: [], shipments: [], publicUrl: null,
};

const publicOrder = (payment: PublicOrder['payment']): PublicOrder => ({
  reference: 'K4M2QP', status: 'pending', createdAt: '2026-01-02T10:00:00Z', deliveredAt: null, isPreorder: false, currency: 'GBP',
  items: [], totals: { subtotal: 40, shippingAmount: 6.03, discountAmount: 0, taxAmount: 0, totalAmount: 46.03 },
  shippingAddress: null, shipments: [], cryptoPayments: [], payment,
});

const method = {
  slot: 'card' as const, method: 'stripe', displayName: 'Card', type: 'gateway' as const, details: null, feeType: null,
  feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 46.03,
};

let client: QueryClient;
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={['/account/orders/K4M2QP']}>
          <Routes><Route path="/account/orders/:ref" element={<OrderDetailPage />} /></Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
  optionsMock.mockReset().mockResolvedValue([method]);
  selectMock.mockReset();
  cancelMock.mockReset();
});
afterEach(cleanup);

describe('account order: pay and cancel', () => {
  it('an unpaid order with an access key shows the payment section under the balance', async () => {
    h.order = { ...base, accessKey: 'abc123', canCancel: true, cancelBlockedBy: null };
    fetchMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    mount();
    expect(await screen.findByText(/Choose how to pay/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('K4M2QP', 'abc123');
    expect(screen.getByText('Balance due')).toBeTruthy();
  });

  it('with a pending hosted payment it offers the checkout link', async () => {
    h.order = { ...base, accessKey: 'abc123', canCancel: true, cancelBlockedBy: null };
    fetchMock.mockResolvedValue(publicOrder({
      canPay: true, payBy: null,
      activePayment: { paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', canChange: true },
    }));
    mount();
    const link = await screen.findByRole('link', { name: /Open secure checkout/ });
    expect(link.getAttribute('href')).toBe('https://pay.example/abc');
    expect(screen.getByRole('button', { name: /Change/ })).toBeTruthy();
  });

  it('offers Cancel order on an unpaid order, and refreshes both queries after cancelling', async () => {
    h.order = { ...base, accessKey: 'abc123', canCancel: true, cancelBlockedBy: null };
    fetchMock.mockResolvedValue(publicOrder({ canPay: true, canCancel: true, payBy: null, activePayment: null }));
    cancelMock.mockResolvedValueOnce({ reference: 'K4M2QP', status: 'cancelled' });
    mount();
    await screen.findByText(/Choose how to pay/);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(cancelMock).toHaveBeenCalledWith('K4M2QP');
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(['order', 'K4M2QP']));
    expect(keys).toContain(JSON.stringify(['orders']));
    expect(keys).toContain(JSON.stringify(['public-order', 'K4M2QP', 'abc123']));
  });

  it('shows the contact line when the order cannot be cancelled by the customer', async () => {
    h.order = { ...base, accessKey: 'abc123', canCancel: false, cancelBlockedBy: 'bank_transfer' };
    fetchMock.mockResolvedValue(publicOrder({ canPay: false, payBy: null, activePayment: null }));
    mount();
    expect(await screen.findByText(/To cancel this order, contact us/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
  });

  it.each([['undefined', undefined], ['null', null]])('without an access key (%s) the page is exactly as before', async (_name, accessKey) => {
    h.order = { ...base, accessKey };
    const { container } = mount();
    expect(screen.getByText('Balance due')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Choose how to pay/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    // The old bare band: the paragraph is the part's own root, with no wrapper around it.
    const band = [...container.querySelectorAll('p')].find((p) => p.textContent?.startsWith('Balance due'))!;
    expect(band.parentElement?.querySelector('[data-sf-part="cancel"]')).toBeNull();
  });

  it('a settled order shows neither', async () => {
    h.order = { ...base, outstandingBalance: 0, accessKey: 'abc123', canCancel: false, cancelBlockedBy: 'paid' };
    mount();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Balance due')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(screen.queryByText(/Choose how to pay/)).toBeNull();
  });

  it('if the order link cannot be loaded the balance still shows', async () => {
    h.order = { ...base, accessKey: 'abc123', canCancel: true, cancelBlockedBy: null };
    fetchMock.mockRejectedValue(new Error('offline'));
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('Balance due')).toBeTruthy();
    expect(screen.queryByText(/Choose how to pay/)).toBeNull();
  });

  it('choosing a method refetches the account order; the first load does not', async () => {
    h.order = { ...base, accessKey: 'abc123', canCancel: true, cancelBlockedBy: null };
    fetchMock.mockResolvedValueOnce(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    selectMock.mockResolvedValueOnce({
      paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', crypto: null,
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(await screen.findByRole('button', { name: /Card/ }));
    // The picker refreshes the public order; its new state then refreshes the account order.
    fetchMock.mockResolvedValue(publicOrder({
      canPay: true, payBy: null,
      activePayment: { paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', canChange: true },
    }));
    await waitFor(() => {
      const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(keys).toContain(JSON.stringify(['order', 'K4M2QP']));
    });
    expect(selectMock).toHaveBeenCalled();
  });

  it('the first load of the public order does not refetch the account order', async () => {
    h.order = { ...base, accessKey: 'abc123', canCancel: true, cancelBlockedBy: null };
    fetchMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mount();
    await screen.findByText(/Choose how to pay/);
    expect(invalidate.mock.calls.filter((c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(['order', 'K4M2QP']))).toHaveLength(0);
  });
});
