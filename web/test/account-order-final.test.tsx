import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  order: {} as Record<string, unknown>,
  orderError: null as unknown,
  links: [] as Array<{ label: string; url: string }>,
}));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply', links: {} }, supportLinks: h.links }),
}));
vi.mock('@/features/account/queries.ts', async (orig) => ({
  ...(await orig<typeof import('@/features/account/queries.ts')>()),
  useOrder: () => ({
    data: h.orderError && !h.order.reference ? undefined : h.order,
    isPending: false,
    isError: !!h.orderError,
    error: h.orderError,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/api/orders.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/orders.ts')>()),
  cancelOrder: vi.fn(),
  fetchOrderPayment: vi.fn(),
  fetchOrderPaymentOptions: vi.fn(),
  selectOrderPaymentMethod: vi.fn(),
  submitOrderCryptoTxid: vi.fn(),
}));

import {
  OrderGoneError, OrderNotCancellableError, PaymentConflictError, cancelOrder, fetchOrderPayment, fetchOrderPaymentOptions,
  selectOrderPaymentMethod, submitOrderCryptoTxid,
} from '@/api/orders.ts';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import { ApiError } from '@/lib/errors.ts';
import type { PublicOrder } from '@/types/public-order.ts';

const paymentMock = vi.mocked(fetchOrderPayment);
const optionsMock = vi.mocked(fetchOrderPaymentOptions);
const selectMock = vi.mocked(selectOrderPaymentMethod);
const cancelMock = vi.mocked(cancelOrder);
const txidMock = vi.mocked(submitOrderCryptoTxid);

const base = {
  reference: 'K4M2QP', totalAmount: 46.03, outstandingBalance: 46.03, createdAt: '2026-01-02T10:00:00Z', status: 'pending',
  subtotal: 40, shippingAmount: 6.03, discountAmount: 0, items: [], payments: [], shipments: [],
  canCancel: true, cancelBlockedBy: null,
};
const publicOrder = (payment: PublicOrder['payment'], over: Partial<PublicOrder> = {}): PublicOrder => ({
  reference: 'K4M2QP', status: 'pending', createdAt: '2026-01-02T10:00:00Z', deliveredAt: null, isPreorder: false, currency: 'GBP',
  items: [], totals: { subtotal: 40, shippingAmount: 6.03, discountAmount: 0, taxAmount: 0, totalAmount: 46.03 },
  shippingAddress: null, shipments: [], cryptoPayments: [], payment, ...over,
});
const choose = () => publicOrder({ canPay: true, payBy: null, activePayment: null });
const hosted = (id = 9, over: Record<string, unknown> = {}) => publicOrder({
  canPay: true, payBy: null,
  activePayment: { paymentId: id, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', canChange: true, ...over },
});
const method = {
  slot: 'card' as const, method: 'stripe', displayName: 'Card', type: 'gateway' as const, details: null, feeType: null,
  feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 46.03,
};
const cryptoPayment = { paymentId: 5, paymentStatus: 'pending', coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon', address: '0xabc', coinAmount: '1', fiatAmount: 1, verificationStatus: 'pending', needsAttention: false, txidMasked: null };

let client: QueryClient;
const tree = () => (
  <QueryClientProvider client={client}>
    <MantineProvider env="test">
      <MemoryRouter initialEntries={['/account/orders/K4M2QP']}>
        <Routes><Route path="/account/orders/:ref" element={<OrderDetailPage />} /></Routes>
      </MemoryRouter>
    </MantineProvider>
  </QueryClientProvider>
);
const keysOf = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey));

beforeEach(() => {
  vi.restoreAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.links = [];
  h.order = { ...base };
  h.orderError = null;
  paymentMock.mockReset();
  optionsMock.mockReset().mockResolvedValue([method]);
  selectMock.mockReset();
  cancelMock.mockReset();
  txidMock.mockReset();
});
afterEach(cleanup);

describe('A1: a payment that has landed is not "can\'t be paid online"', () => {
  const stuck = /This balance can't be paid online/;
  const paid = () => publicOrder({ canPay: false, payBy: null, activePayment: null }, { status: 'confirmed' });

  it('paid elsewhere, seen on the first read: a neutral line, no help text, and both lists refetch at once', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    paymentMock.mockResolvedValue(paid());
    render(tree());
    expect(await screen.findByText('Updating your order…')).toBeTruthy();
    expect(screen.queryByText(stuck)).toBeNull();
    await waitFor(() => expect(keysOf(invalidate)).toContain(JSON.stringify(['order', 'K4M2QP'])));
    expect(keysOf(invalidate)).toContain(JSON.stringify(['orders']));
  });

  it('paid during the visit: the same neutral line and both refetches', async () => {
    paymentMock.mockResolvedValueOnce(choose());
    render(tree());
    await screen.findByText(/Choose how you.d like to pay/);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    paymentMock.mockResolvedValue(paid());
    await act(async () => { await client.refetchQueries({ queryKey: ['order-payment', 'K4M2QP'] }); });
    expect(await screen.findByText('Updating your order…')).toBeTruthy();
    expect(screen.queryByText(stuck)).toBeNull();
    await waitFor(() => expect(keysOf(invalidate)).toContain(JSON.stringify(['orders'])));
    expect(keysOf(invalidate)).toContain(JSON.stringify(['order', 'K4M2QP']));
  });

  it('the account order never catches up (its refetch fails): the neutral line stays and the help text never appears', async () => {
    paymentMock.mockResolvedValue(paid());
    render(tree());
    await screen.findByText('Updating your order…');
    await act(async () => { await client.refetchQueries({ queryKey: ['order-payment', 'K4M2QP'] }); });
    expect(screen.getByText('Updating your order…')).toBeTruthy();
    expect(screen.queryByText(stuck)).toBeNull();
  });

  it('an order the payment view agrees is pending and unpaid but not payable online still gets the help text', async () => {
    paymentMock.mockResolvedValue(publicOrder({ canPay: false, payBy: null, activePayment: null }));
    render(tree());
    expect(await screen.findByText(stuck)).toBeTruthy();
    expect(screen.queryByText('Updating your order…')).toBeNull();
  });
});

describe('A2: an order that is gone for this customer', () => {
  it('a 404 choosing a method invalidates the order and the payment view and shows no method error', async () => {
    paymentMock.mockResolvedValue(choose());
    selectMock.mockRejectedValue(new OrderGoneError());
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: /Card/ }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await waitFor(() => expect(selectMock).toHaveBeenCalled());
    await waitFor(() => expect(keysOf(invalidate)).toContain(JSON.stringify(['order', 'K4M2QP'])));
    expect(keysOf(invalidate)).toContain(JSON.stringify(['order-payment', 'K4M2QP']));
    expect(screen.queryByText(/isn.t available right now/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a 404 submitting a txid shows no "rejected" message and invalidates the order', async () => {
    paymentMock.mockResolvedValue(publicOrder({ canPay: false, payBy: null, activePayment: null }, { cryptoPayments: [cryptoPayment] }));
    txidMock.mockRejectedValue(new OrderGoneError());
    render(tree());
    const input = await screen.findByLabelText(/transaction id/i);
    fireEvent.change(input, { target: { value: '0x'.padEnd(20, 'a') } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(txidMock).toHaveBeenCalled());
    await waitFor(() => expect(keysOf(invalidate)).toContain(JSON.stringify(['order', 'K4M2QP'])));
    expect(screen.queryByText(/not accepted/)).toBeNull();
  });

  it('a 404 from cancel says the order is no longer waiting for payment, and refreshes', async () => {
    paymentMock.mockResolvedValue(choose());
    // What `cancelOrder` throws for a 404 (mapped in api/orders.ts, pinned in api-orders.test.ts).
    cancelMock.mockRejectedValue(new OrderNotCancellableError('not_pending'));
    render(tree());
    await screen.findByText(/Choose how you.d like to pay/);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Yes, cancel order' })); });
    await waitFor(() => expect(screen.getAllByText('This order is no longer waiting for payment.').length).toBeGreaterThan(0));
    expect(screen.queryByText(/couldn.t cancel the order/)).toBeNull();
    expect(keysOf(invalidate)).toContain(JSON.stringify(['order', 'K4M2QP']));
  });

  it('a 404 from the payment read invalidates the order once, and does not loop', async () => {
    paymentMock.mockRejectedValue(new OrderGoneError());
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(tree());
    await waitFor(() => expect(keysOf(invalidate)).toContain(JSON.stringify(['order', 'K4M2QP'])));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(keysOf(invalidate).filter((k) => k === JSON.stringify(['order', 'K4M2QP']))).toHaveLength(1);
  });

  it('a 404 loading the methods invalidates the order and shows no error', async () => {
    paymentMock.mockResolvedValue(choose());
    optionsMock.mockRejectedValue(new OrderGoneError());
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(tree());
    await waitFor(() => expect(keysOf(invalidate)).toContain(JSON.stringify(['order', 'K4M2QP'])));
    expect(screen.queryByText(/couldn.t load the payment methods/)).toBeNull();
  });

  it('a 429 on the payment read says so in words', async () => {
    paymentMock.mockRejectedValue(new ApiError(429, 'Too Many Requests'));
    render(tree());
    expect(await screen.findByText('Too many attempts. Please wait a moment and try again.')).toBeTruthy();
    expect(screen.queryByText(/couldn.t load the payment options/)).toBeNull();
  });

  it('a 404 on the order read itself shows the not-found screen even with the old data still cached', async () => {
    h.orderError = new ApiError(404, 'not found');
    paymentMock.mockResolvedValue(choose());
    render(tree());
    expect(await screen.findByRole('heading', { level: 1, name: "We can't find that order" })).toBeTruthy();
  });
});

describe('A3: telling the customer that payment arrived', () => {
  it('an order that was owed and is now settled shows a notification and fills the status region, once', async () => {
    const show = vi.spyOn(notifications, 'show').mockReturnValue('x');
    paymentMock.mockResolvedValue(choose());
    const view = render(tree());
    await screen.findByText(/Choose how you.d like to pay/);
    expect(show).not.toHaveBeenCalled();
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', canCancel: false, cancelBlockedBy: 'paid' };
    view.rerender(tree());
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(show.mock.calls[0][0]).toMatchObject({ message: 'Payment received. Thank you.' });
    expect(screen.getByRole('status').textContent).toBe('Payment received. Thank you.');
    view.rerender(tree());
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('an order that is already paid on first load says nothing, but the status region exists', async () => {
    const show = vi.spyOn(notifications, 'show').mockReturnValue('x');
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed' };
    render(tree());
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(show).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('cancelling an owed order is not "payment received"', async () => {
    const show = vi.spyOn(notifications, 'show').mockReturnValue('x');
    paymentMock.mockResolvedValue(choose());
    const view = render(tree());
    await screen.findByText(/Choose how you.d like to pay/);
    h.order = { ...base, status: 'cancelled', canCancel: false };
    view.rerender(tree());
    await screen.findByText(/This order was cancelled\./);
    expect(show).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Payment received. Thank you.' }));
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

describe('A4: focus does not fall to the page', () => {
  it('after a successful cancel, focus lands on the page heading', async () => {
    vi.spyOn(notifications, 'show').mockReturnValue('x');
    paymentMock.mockResolvedValue(choose());
    cancelMock.mockResolvedValue({ reference: 'K4M2QP', status: 'cancelled' });
    const view = render(tree());
    await screen.findByText(/Choose how you.d like to pay/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Yes, cancel order' })); });
    h.order = { ...base, status: 'cancelled', canCancel: false };
    view.rerender(tree());
    const title = await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(title.getAttribute('tabindex')).toBe('-1');
  });

  it('when a payment is created, focus moves to the new face heading', async () => {
    paymentMock.mockResolvedValueOnce(choose());
    selectMock.mockResolvedValue({ paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', crypto: null });
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(tree());
    paymentMock.mockResolvedValue(hosted(9));
    fireEvent.click(await screen.findByRole('button', { name: /Card/ }));
    const head = await screen.findByRole('heading', { name: 'Finish your payment' });
    await waitFor(() => expect(document.activeElement).toBe(head));
  });

  it('the first load with a payment already open does not steal focus', async () => {
    paymentMock.mockResolvedValue(hosted(9));
    render(tree());
    const head = await screen.findByRole('heading', { name: 'Finish your payment' });
    expect(document.activeElement).not.toBe(head);
  });
});

describe('A5: no second payment while the first is settling', () => {
  it('a second tap during the payment refetch sends nothing, and the old face does not come back', async () => {
    paymentMock.mockResolvedValueOnce(hosted(9));
    selectMock.mockResolvedValue({ paymentId: 10, method: 'paypal', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/def', crypto: null });
    optionsMock.mockResolvedValue([method, { ...method, method: 'paypal', displayName: 'PayPal' }]);
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: /Change/ }));
    let release: (v: PublicOrder) => void = () => undefined;
    paymentMock.mockImplementation(() => new Promise<PublicOrder>((r) => { release = r; }));
    const paypal = await screen.findByRole('button', { name: /PayPal/ });
    fireEvent.click(paypal);
    await waitFor(() => expect(selectMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole('button', { name: /Card/ }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Card/ }));
    expect(selectMock).toHaveBeenCalledTimes(1);
    // The old payment's checkout button must not reappear while the refetch is in flight.
    expect(screen.queryByRole('link', { name: /Open secure checkout/ })).toBeNull();
    await act(async () => { release(hosted(10)); });
    expect(await screen.findByRole('link', { name: /Open secure checkout/ })).toBeTruthy();
  });

  it('a conflict (409) refetches the payment view and shows no error text', async () => {
    paymentMock.mockResolvedValue(choose());
    selectMock.mockRejectedValue(new PaymentConflictError());
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: /Card/ }));
    await waitFor(() => expect(paymentMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('A6: a failed background refetch does not replace the page', () => {
  it('keeps the order on screen when an error arrives with data still cached', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed' };
    h.orderError = new ApiError(500, 'boom');
    render(tree());
    expect(await screen.findByRole('heading', { level: 1, name: 'K4M2QP' })).toBeTruthy();
    expect(screen.queryByText("We couldn't load that order")).toBeNull();
  });
});

describe('A7: the hosted face needs something to open', () => {
  it('a gateway payment with no checkout URL falls back to the picker', async () => {
    paymentMock.mockResolvedValue(hosted(9, { checkoutUrl: null }));
    render(tree());
    expect(await screen.findByText(/Choose how you.d like to pay/)).toBeTruthy();
    expect(screen.queryByText('Finish your payment')).toBeNull();
  });

  it('a gateway payment that is not pending falls back to the picker', async () => {
    paymentMock.mockResolvedValue(hosted(9, { status: 'failed' }));
    render(tree());
    expect(await screen.findByText(/Choose how you.d like to pay/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Open secure checkout/ })).toBeNull();
  });

  it('with nothing to pay with and no way to pay online, it says so', async () => {
    paymentMock.mockResolvedValue(publicOrder({ canPay: false, payBy: null, activePayment: { paymentId: 9, method: 'stripe', kind: 'gateway', status: 'failed', checkoutUrl: null, canChange: false } }));
    render(tree());
    expect(await screen.findByText(/This balance can't be paid online/)).toBeTruthy();
  });
});

describe('A10: a tab left open stops polling every ten seconds', () => {
  it('after ten minutes of watching, the payment view is read at most once a minute', async () => {
    vi.useFakeTimers();
    try {
      paymentMock.mockResolvedValue(hosted(9));
      render(tree());
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(paymentMock.mock.calls.length).toBe(3);
      await vi.advanceTimersByTimeAsync(10 * 60_000 - 20_000 + 1_000);
      const settled = paymentMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(58_000);
      expect(paymentMock.mock.calls.length).toBe(settled);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(paymentMock.mock.calls.length).toBe(settled + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
