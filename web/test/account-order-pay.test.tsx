import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ order: {} as Record<string, unknown>, links: [] as Array<{ label: string; url: string }>, builder: false, inTelegram: false }));
vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => h.builder }));
vi.mock('@/lib/telegram-webapp.ts', async (orig) => ({ ...(await orig<typeof import('@/lib/telegram-webapp.ts')>()), openExternalLink: vi.fn(), isTelegramWebApp: () => h.inTelegram }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply', links: {} }, supportLinks: h.links }),
}));
vi.mock('@/features/account/queries.ts', async (orig) => ({
  ...(await orig<typeof import('@/features/account/queries.ts')>()),
  useOrder: () => ({ data: h.order, isPending: false, isError: false }),
}));
vi.mock('@/api/orders.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/orders.ts')>()),
  cancelOrder: vi.fn(),
  fetchOrderPayment: vi.fn(),
  fetchOrderPaymentOptions: vi.fn(),
  selectOrderPaymentMethod: vi.fn(),
}));

import { OrderGoneError, PaymentConflictError, cancelOrder, fetchOrderPayment, fetchOrderPaymentOptions, selectOrderPaymentMethod } from '@/api/orders.ts';
import { openExternalLink } from '@/lib/telegram-webapp.ts';
import { ApiError } from '@/lib/errors.ts';
import { paymentSignature } from '@/features/order-status/payment-state.ts';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import type { PublicOrder } from '@/types/public-order.ts';

const paymentMock = vi.mocked(fetchOrderPayment);
const optionsMock = vi.mocked(fetchOrderPaymentOptions);
const selectMock = vi.mocked(selectOrderPaymentMethod);
const cancelMock = vi.mocked(cancelOrder);

const base = {
  reference: 'K4M2QP', totalAmount: 46.03, outstandingBalance: 46.03, createdAt: '2026-01-02T10:00:00Z', status: 'pending',
  subtotal: 40, shippingAmount: 6.03, discountAmount: 0, items: [], payments: [], shipments: []
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
  h.links = [];
  h.builder = false;
  h.inTelegram = false;
  vi.mocked(openExternalLink).mockClear();
  paymentMock.mockReset();
  optionsMock.mockReset().mockResolvedValue([method]);
  selectMock.mockReset();
  cancelMock.mockReset();
});
afterEach(cleanup);

describe('account order: pay and cancel', () => {
  it('an unpaid order shows the payment section with no access key on the order', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    mount();
    expect(await screen.findByText(/Choose how you.d like to pay/)).toBeTruthy();
    expect(paymentMock).toHaveBeenCalledWith('K4M2QP');
    expect(screen.getByText('Balance due')).toBeTruthy();
  });

  it('with a pending hosted payment it offers the checkout link', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValue(publicOrder({
      canPay: true, payBy: null,
      activePayment: { paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', canChange: true },
    }));
    mount();
    const link = await screen.findByRole('link', { name: /Click here to Pay/ });
    expect(link.getAttribute('href')).toBe('https://pay.example/abc');
    expect(screen.getByRole('button', { name: /Change/ })).toBeTruthy();
  });

  describe('the pay link', () => {
    const showLink = async () => {
      h.order = { ...base, canCancel: true, cancelBlockedBy: null };
      paymentMock.mockResolvedValue(publicOrder({
        canPay: true, payBy: null,
        activePayment: { paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', canChange: true },
      }));
      mount();
      return screen.findByRole('link', { name: 'Click here to Pay' });
    };

    it('outside Telegram it is a plain link: the click is left alone', async () => {
      const link = await showLink();
      const proceeded = fireEvent.click(link);
      expect(proceeded).toBe(true);
      expect(openExternalLink).not.toHaveBeenCalled();
    });

    it('inside Telegram the click goes to Telegram\'s link opener, and the link keeps its href', async () => {
      h.inTelegram = true;
      const link = await showLink();
      const proceeded = fireEvent.click(link);
      expect(proceeded).toBe(false);
      expect(openExternalLink).toHaveBeenCalledTimes(1);
      expect(openExternalLink).toHaveBeenCalledWith('https://pay.example/abc');
      expect(link.getAttribute('href')).toBe('https://pay.example/abc');
      expect(link.getAttribute('target')).toBe('_blank');
    });
  });

  describe('the hosted face names the method the customer chose', () => {
    const attempt = (method: string, methodLabel: string | undefined, status: string, createdAt: string) =>
      ({ method, methodLabel, amount: 46.03, status, createdAt });
    const hostedWith = (method: string, paymentId = 9) => publicOrder({
      canPay: true, payBy: null,
      activePayment: { paymentId, method, kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', canChange: true },
    });
    const line = () => screen.getByText(/^Paying with /).closest('p')!;

    it('says "Paying with" and the shops own name for the pending payment, keeping the reassurance', async () => {
      h.order = { ...base, canCancel: true, cancelBlockedBy: null, payments: [attempt('stripe', 'Card (Stripe)', 'pending', '2026-01-02T10:01:00Z')] };
      paymentMock.mockResolvedValue(hostedWith('stripe'));
      mount();
      expect((await screen.findByText('Paying with Card (Stripe)')).textContent).toBe('Paying with Card (Stripe)');
      expect(line().textContent).toContain('Secure hosted checkout');
    });

    it('uses the newest pending payment of that method, not an older or failed one', async () => {
      h.order = {
        ...base, canCancel: true, cancelBlockedBy: null,
        payments: [
          attempt('stripe', 'Old card name', 'failed', '2026-01-02T10:05:00Z'),
          attempt('stripe', 'Card (Stripe)', 'pending', '2026-01-02T10:03:00Z'),
          attempt('stripe', 'Older card name', 'pending', '2026-01-02T10:01:00Z'),
          attempt('other', 'Bank transfer', 'pending', '2026-01-02T10:09:00Z'),
        ],
      };
      paymentMock.mockResolvedValue(hostedWith('stripe'));
      mount();
      await screen.findByText('Paying with Card (Stripe)');
    });

    it('without a label it reads the method id as words, like the payment history does', async () => {
      h.order = { ...base, canCancel: true, cancelBlockedBy: null, payments: [attempt('card_gateway', undefined, 'pending', '2026-01-02T10:01:00Z')] };
      paymentMock.mockResolvedValue(hostedWith('card_gateway'));
      mount();
      await screen.findByText('Paying with Card Gateway');
    });

    it('with no matching payment on the order it falls back to the readable method id', async () => {
      h.order = { ...base, canCancel: true, cancelBlockedBy: null, payments: [] };
      paymentMock.mockResolvedValue(hostedWith('stripe'));
      mount();
      await screen.findByText('Paying with Stripe');
    });

    it('follows the new active payment after the method is changed', async () => {
      h.order = {
        ...base, canCancel: true, cancelBlockedBy: null,
        payments: [
          attempt('stripe', 'Card (Stripe)', 'pending', '2026-01-02T10:01:00Z'),
          attempt('sushipp', 'Pay by card', 'pending', '2026-01-02T10:05:00Z'),
        ],
      };
      paymentMock.mockResolvedValue(hostedWith('stripe'));
      mount();
      await screen.findByText('Paying with Card (Stripe)');
      paymentMock.mockResolvedValue(hostedWith('sushipp', 10));
      await poll();
      await screen.findByText('Paying with Pay by card');
      expect(screen.queryByText('Paying with Card (Stripe)')).toBeNull();
    });

    it('with nothing to name, the old reassurance shows alone', async () => {
      h.order = { ...base, canCancel: true, cancelBlockedBy: null, payments: [] };
      paymentMock.mockResolvedValue(hostedWith(''));
      mount();
      expect(await screen.findByText('Secure hosted checkout')).toBeTruthy();
      expect(screen.queryByText(/^Paying with/)).toBeNull();
    });

    it('a method arranged with the shop gets the line too', async () => {
      h.order = { ...base, canCancel: true, cancelBlockedBy: null, payments: [attempt('bank_transfer', 'Bank transfer', 'pending', '2026-01-02T10:01:00Z')] };
      paymentMock.mockResolvedValue(publicOrder({
        canPay: true, payBy: null,
        activePayment: { paymentId: 11, method: 'bank_transfer', kind: 'other', status: 'pending', checkoutUrl: null, canChange: true },
      }));
      mount();
      await screen.findByText('Paying with Bank transfer');
      expect(screen.queryByText('Secure hosted checkout')).toBeNull();
    });
  });

  it('offers Cancel order on an unpaid order, and refreshes both queries after cancelling', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, canCancel: true, payBy: null, activePayment: null }));
    cancelMock.mockResolvedValueOnce({ reference: 'K4M2QP', status: 'cancelled' });
    mount();
    await screen.findByText(/Choose how you.d like to pay/);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Yes, cancel order' })); });
    expect(cancelMock).toHaveBeenCalledWith('K4M2QP');
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(['order', 'K4M2QP']));
    expect(keys).toContain(JSON.stringify(['orders']));
    expect(keys).toContain(JSON.stringify(['order-payment', 'K4M2QP']));
  });

  it('shows the contact line when the order cannot be cancelled by the customer', async () => {
    h.order = { ...base, canCancel: false, cancelBlockedBy: 'bank_transfer' };
    paymentMock.mockResolvedValue(publicOrder({ canPay: false, payBy: null, activePayment: null }));
    mount();
    expect(await screen.findByText(/To cancel this order, contact us/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
  });

  it('a paid order asks for no payment state at all', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', canCancel: false, cancelBlockedBy: 'paid' };
    mount();
    await screen.findByText('K4M2QP');
    expect(paymentMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Balance due')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(screen.queryByText(/Choose how you.d like to pay/)).toBeNull();
  });

  it('if the payment view cannot be loaded the balance still shows', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockRejectedValue(new Error('offline'));
    mount();
    await waitFor(() => expect(paymentMock).toHaveBeenCalled());
    expect(screen.getByText('Balance due')).toBeTruthy();
    expect(screen.queryByText(/Choose how you.d like to pay/)).toBeNull();
  });

  const orderKeys = (invalidate: { mock: { calls: unknown[][] } }) =>
    invalidate.mock.calls.filter((c) => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey) === JSON.stringify(['order', 'K4M2QP']));
  const hostedOrder = publicOrder({
    canPay: true, payBy: null,
    activePayment: { paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', canChange: true },
  });
  const poll = async () => { await act(async () => { await client.refetchQueries({ queryKey: ['order-payment', 'K4M2QP'] }); }); };

  it('choosing a method refetches the account order exactly once; the first load does not', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValueOnce(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    selectMock.mockResolvedValueOnce({
      paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', crypto: null,
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(await screen.findByRole('button', { name: /Card/ }));
    expect(orderKeys(invalidate)).toHaveLength(0);
    paymentMock.mockResolvedValue(hostedOrder);
    await waitFor(() => expect(orderKeys(invalidate)).toHaveLength(1));
    // The payment view has been re-read after the selection: nothing more is refetched once it has settled.
    await waitFor(() => expect(paymentMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    await screen.findByRole('link', { name: /Click here to Pay/ });
    expect(orderKeys(invalidate)).toHaveLength(1);
    expect(selectMock).toHaveBeenCalled();
  });

  describe('choosing a hosted method', () => {
    type Selected = Awaited<ReturnType<typeof selectOrderPaymentMethod>>;
    const selected = (checkoutUrl: string | null): Selected => ({ paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl, crypto: null });

    // Held open so the test can look at the moment between the tap and the payment existing.
    const choose = async () => {
      h.order = { ...base, canCancel: true, cancelBlockedBy: null };
      paymentMock.mockResolvedValueOnce(publicOrder({ canPay: true, payBy: null, activePayment: null }));
      let release: (r: Selected) => void = () => undefined;
      let fail: (e: Error) => void = () => undefined;
      selectMock.mockReturnValueOnce(new Promise<Selected>((resolve, reject) => { release = resolve; fail = reject; }));
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      open.mockClear();
      mount();
      fireEvent.click(await screen.findByRole('button', { name: /Card/ }));
      await waitFor(() => expect(selectMock).toHaveBeenCalled());
      return { open, release, fail };
    };

    it('opens and navigates nowhere, and the finish-payment face offers a Click here to Pay link', async () => {
      const here = window.location.href;
      const { open, release } = await choose();
      expect(open).not.toHaveBeenCalled();
      expect(openExternalLink).not.toHaveBeenCalled();
      paymentMock.mockResolvedValue(hostedOrder);
      await act(async () => { release(selected('https://pay.example/abc')); });
      const link = await screen.findByRole('link', { name: 'Click here to Pay' });
      expect(link.getAttribute('href')).toBe('https://pay.example/abc');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener');
      expect(open).not.toHaveBeenCalled();
      expect(openExternalLink).not.toHaveBeenCalled();
      expect(window.location.href).toBe(here);
    });

    it('goes nowhere when the payment has no checkout address', async () => {
      const { open, release } = await choose();
      await act(async () => { release(selected(null)); });
      expect(open).not.toHaveBeenCalled();
      expect(openExternalLink).not.toHaveBeenCalled();
    });

    it('goes nowhere when the selection fails', async () => {
      const { open, fail } = await choose();
      await act(async () => { fail(new ApiError(500, 'Payment provider unreachable')); });
      expect(open).not.toHaveBeenCalled();
      expect(openExternalLink).not.toHaveBeenCalled();
    });

    it('in the page builder it stays inert even when the selection resolves', async () => {
      h.builder = true;
      const { open, release } = await choose();
      await act(async () => { release(selected('https://pay.example/abc')); });
      expect(open).not.toHaveBeenCalled();
      expect(openExternalLink).not.toHaveBeenCalled();
    });
  });

  describe('when choosing a method fails', () => {
    const chooseCard = async () => {
      h.order = { ...base, canCancel: true, cancelBlockedBy: null };
      paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
      vi.spyOn(window, 'open').mockReturnValue(null);
      mount();
      fireEvent.click(await screen.findByRole('button', { name: /Card/ }));
    };

    it('a conflict (the order moved on) re-reads the payment view and shows no error', async () => {
      selectMock.mockRejectedValue(new PaymentConflictError());
      await chooseCard();
      await waitFor(() => expect(paymentMock.mock.calls.length).toBeGreaterThanOrEqual(2));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText(/isn.t available right now/)).toBeNull();
    });

    it('a server error says so, leaves the buttons enabled, and a second click retries', async () => {
      selectMock.mockRejectedValue(new ApiError(500, 'Payment provider unreachable'));
      await chooseCard();
      expect((await screen.findByRole('alert')).textContent).toBe('Payment provider unreachable');
      const card = screen.getByRole('button', { name: /Card/ }) as HTMLButtonElement;
      expect(card.disabled).toBe(false);
      fireEvent.click(card);
      await waitFor(() => expect(selectMock).toHaveBeenCalledTimes(2));
    });

    it('an order that is gone shows no method error and crashes nothing: the page learns it from the order read', async () => {
      selectMock.mockRejectedValue(new OrderGoneError());
      await chooseCard();
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      await waitFor(() => expect(JSON.stringify(invalidate.mock.calls.map((c) => c[0]?.queryKey))).toContain('"order","K4M2QP"'));
      expect(screen.queryByRole('alert')).toBeNull();
      expect((screen.getByRole('button', { name: /Card/ }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('the first load of the payment view does not refetch the account order', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mount();
    await screen.findByText(/Choose how you.d like to pay/);
    expect(orderKeys(invalidate)).toHaveLength(0);
  });

  it('polls that return the same data never refetch the account order; a changed payment state does, once', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mount();
    await screen.findByText(/Choose how you.d like to pay/);
    await poll(); await poll(); await poll();
    expect(paymentMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(orderKeys(invalidate)).toHaveLength(0);
    paymentMock.mockResolvedValue(hostedOrder);
    await poll();
    await waitFor(() => expect(orderKeys(invalidate)).toHaveLength(1));
    await poll();
    expect(orderKeys(invalidate)).toHaveLength(1);
  });

  it('after a failed read the payment view is read once a minute, not at the order own 10s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      h.order = { ...base, canCancel: true, cancelBlockedBy: null };
      paymentMock.mockResolvedValueOnce(hostedOrder).mockRejectedValue(new Error('429'));
      mount();
      await vi.advanceTimersByTimeAsync(0);
      expect(paymentMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(paymentMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(59_000);
      expect(paymentMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(paymentMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('going A, B, A still notices a change made to A while B was showing', async () => {
    const at = (ref: string) => (
      <QueryClientProvider client={client}>
        <MantineProvider env="test">
          <MemoryRouter initialEntries={[`/account/orders/${ref}`]}>
            <Routes><Route path="/account/orders/:ref" element={<OrderDetailPage />} /></Routes>
          </MemoryRouter>
        </MantineProvider>
      </QueryClientProvider>
    );
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockImplementation(async (ref: string) => ({ ...publicOrder({ canPay: true, payBy: null, activePayment: null }), reference: ref }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = mount();
    await screen.findByText(/Choose how you.d like to pay/);
    h.order = { ...base, reference: 'Z9Z9Z9', canCancel: true, cancelBlockedBy: null };
    view.rerender(at('Z9Z9Z9'));
    await waitFor(() => expect(paymentMock).toHaveBeenCalledWith('Z9Z9Z9'));
    await screen.findByText(/Choose how you.d like to pay/);
    expect(orderKeys(invalidate)).toHaveLength(0);
    // A's payment state moves on while B is showing (what its last poll would have stored).
    client.setQueryData(['order-payment', 'K4M2QP'], hostedOrder);
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    view.rerender(at('K4M2QP'));
    await screen.findByRole('link', { name: /Click here to Pay/ });
    await waitFor(() => expect(orderKeys(invalidate)).toHaveLength(1));
  });

  it("showing another order does not refetch on that order's first load", async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = mount();
    await screen.findByText(/Choose how you.d like to pay/);
    h.order = { ...base, reference: 'Z9Z9Z9', canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValue({ ...hostedOrder, reference: 'Z9Z9Z9' });
    view.rerender(
      <QueryClientProvider client={client}>
        <MantineProvider env="test">
          <MemoryRouter initialEntries={['/account/orders/Z9Z9Z9']}>
            <Routes><Route path="/account/orders/:ref" element={<OrderDetailPage />} /></Routes>
          </MemoryRouter>
        </MantineProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(paymentMock).toHaveBeenCalledWith('Z9Z9Z9'));
    await screen.findByRole('link', { name: /Click here to Pay/ });
    const refetched = invalidate.mock.calls.filter((c) => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey)?.startsWith('["order"'));
    expect(refetched).toHaveLength(0);
  });

  describe('a balance that cannot be paid online', () => {
    const help = /This balance can't be paid online/;
    const stuck = () => publicOrder({ canPay: false, payBy: null, activePayment: null });
    it('says so, with the shop support links', async () => {
      h.links = [{ label: 'Chat', url: 'https://t.me/example_shop' }];
      h.order = { ...base, canCancel: false, cancelBlockedBy: null };
      paymentMock.mockResolvedValue(stuck());
      mount();
      expect(await screen.findByText(help)).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Chat' }).getAttribute('href')).toBe('https://t.me/example_shop');
    });
    it('is not shown when the order can be paid', async () => {
      h.order = { ...base, canCancel: true, cancelBlockedBy: null };
      paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
      mount();
      await screen.findByText(/Choose how you.d like to pay/);
      expect(screen.queryByText(help)).toBeNull();
    });
    it('is not shown before the payment view has loaded', async () => {
      h.order = { ...base, canCancel: false, cancelBlockedBy: null };
      paymentMock.mockReturnValue(new Promise(() => {}));
      mount();
      await waitFor(() => expect(paymentMock).toHaveBeenCalled());
      expect(screen.getByRole('region', { name: 'Payment needed' })).toBeTruthy();
      expect(screen.queryByText(help)).toBeNull();
    });
    it('is not shown for a cancelled order', async () => {
      h.order = { ...base, status: 'cancelled', canCancel: false, cancelBlockedBy: null };
      paymentMock.mockResolvedValue({ ...stuck(), status: 'cancelled' });
      mount();
      await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
      // A closed order is not read for payment state at all: there is nothing to pay on it.
      expect(paymentMock).not.toHaveBeenCalled();
      expect(screen.queryByText(help)).toBeNull();
    });
    it('is not shown beside a payment section drawn for a visible crypto payment', async () => {
      h.order = { ...base, canCancel: false, cancelBlockedBy: null };
      const crypto = { paymentId: 5, paymentStatus: 'pending', coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon', address: '0xabc', coinAmount: '1', fiatAmount: 1, verificationStatus: 'checking', needsAttention: false, txidMasked: '0x12...ef' };
      paymentMock.mockResolvedValue({ ...stuck(), cryptoPayments: [crypto] });
      mount();
      await screen.findByRole('region', { name: 'Crypto payment' });
      expect(screen.queryByText(help)).toBeNull();
    });
    it('is not shown beside the cancel control\'s own contact line', async () => {
      h.order = { ...base, canCancel: false, cancelBlockedBy: 'bank_transfer' };
      paymentMock.mockResolvedValue(stuck());
      mount();
      await screen.findByText(/To cancel this order, contact us/);
      expect(screen.queryByText(help)).toBeNull();
    });
  });
});

describe('paymentSignature', () => {
  type Pay = NonNullable<PublicOrder['payment']>;
  const pay = (over: Partial<Pay> = {}): Pay => ({
    canPay: true, canCancel: true, cancelBlockedBy: null, payBy: null,
    activePayment: { paymentId: 1, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: null, canChange: true }, ...over,
  });
  const crypto = { paymentId: 5, paymentStatus: 'pending', coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon', address: '0x', coinAmount: '1', fiatAmount: 1, verificationStatus: 'pending', needsAttention: false, txidMasked: null };
  const o = (over: Partial<PublicOrder> = {}): PublicOrder => ({ ...publicOrder(pay()), cryptoPayments: [crypto], ...over });
  it('is the same for identical data, whatever else moves', () => {
    expect(paymentSignature(o())).toBe(paymentSignature(o({ createdAt: '2027-01-01T00:00:00Z', payment: pay({ payBy: '2027-01-01T00:00:00Z' }) })));
  });
  it.each([
    ['status', () => o({ status: 'confirmed' })],
    ['canPay', () => o({ payment: pay({ canPay: false }) })],
    ['canCancel', () => o({ payment: pay({ canCancel: false }) })],
    ['cancelBlockedBy', () => o({ payment: pay({ cancelBlockedBy: 'paid' }) })],
    ['active payment id', () => o({ payment: pay({ activePayment: { ...pay().activePayment!, paymentId: 2 } }) })],
    ['active payment status', () => o({ payment: pay({ activePayment: { ...pay().activePayment!, status: 'failed' } }) })],
    ['no active payment', () => o({ payment: pay({ activePayment: null }) })],
    ['crypto payment id', () => o({ cryptoPayments: [{ ...crypto, paymentId: 6 }] })],
    ['crypto payment status', () => o({ cryptoPayments: [{ ...crypto, paymentStatus: 'completed' }] })],
    ['crypto verification', () => o({ cryptoPayments: [{ ...crypto, verificationStatus: 'checking' }] })],
    ['no crypto payments', () => o({ cryptoPayments: [] })],
  ])('differs when the %s changes', (_n, change) => {
    expect(paymentSignature(change())).not.toBe(paymentSignature(o()));
  });
});
