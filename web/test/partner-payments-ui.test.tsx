import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ order: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'USD', brand: { name: 'Northbound Supply', links: {} }, supportLinks: [] }),
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

import { fetchOrderPayment } from '@/api/orders.ts';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import { PaymentStep } from '@/features/checkout/steps/PaymentStep.tsx';
import { DEFAULT_FORM } from '@/features/checkout/form-state.ts';
import { PARTNER_WINDOW_MS } from '@/features/order-status/partner-pending.ts';
import type { PaymentMethod, Quote } from '@/types/checkout.ts';
import type { PublicOrder } from '@/types/public-order.ts';

const paymentMock = vi.mocked(fetchOrderPayment);

const base = {
  reference: 'K4M2QP', totalAmount: 46.03, outstandingBalance: 46.03, createdAt: '2026-01-02T10:00:00Z', status: 'pending',
  subtotal: 40, shippingAmount: 6.03, discountAmount: 0, items: [], payments: [], shipments: [], canCancel: true, cancelBlockedBy: null,
};
const view = (payment: PublicOrder['payment']): PublicOrder => ({
  reference: 'K4M2QP', status: 'pending', createdAt: '2026-01-02T10:00:00Z', deliveredAt: null, isPreorder: false, currency: 'USD',
  items: [], totals: { subtotal: 40, shippingAmount: 6.03, discountAmount: 0, taxAmount: 0, totalAmount: 46.03 },
  shippingAddress: null, shipments: [], cryptoPayments: [], payment,
});
const pending = view({ canPay: true, payBy: null, activePayment: null, partnerPending: true });
const hosted = view({
  canPay: true, payBy: null,
  activePayment: { paymentId: 9, method: 'card', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example.invalid/abc', canChange: false, settlementAmount: 65.25, settlementCurrency: 'EUR' },
});

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

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
  h.order = base;
  paymentMock.mockReset();
  vi.useFakeTimers();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('partner pending on the order page', () => {
  it('says the payment is being prepared, re-reads every 5 s and turns into the pay screen on the third read', async () => {
    paymentMock.mockResolvedValueOnce(pending).mockResolvedValueOnce(pending).mockResolvedValue(hosted);
    mount();
    await tick(0);
    expect(screen.getByText('Payment is being prepared')).toBeTruthy();
    expect(screen.queryByText(/Choose how you.d like to pay/)).toBeNull();
    await tick(5_000);
    expect(paymentMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Payment is being prepared')).toBeTruthy();
    await tick(5_000);
    expect(paymentMock).toHaveBeenCalledTimes(3);
    await tick(100);
    expect(screen.getByRole('link', { name: /Click here to Pay/ })).toBeTruthy();
    expect(screen.queryByText('Payment is being prepared')).toBeNull();
    // the placed payment shows what it charges in
    expect(screen.getByText('Charged in EUR: €65.25')).toBeTruthy();
  });

  it('stops asking after 2 minutes, says where the details will appear, and Refresh reads once more', async () => {
    paymentMock.mockResolvedValue(pending);
    mount();
    await tick(PARTNER_WINDOW_MS + 1_000);
    const reads = paymentMock.mock.calls.length;
    expect(reads).toBeGreaterThanOrEqual(24);
    expect(reads).toBeLessThanOrEqual(26);
    expect(screen.getByText(/Your payment details will appear on this order page/)).toBeTruthy();
    await tick(60_000);
    expect(paymentMock).toHaveBeenCalledTimes(reads);
    paymentMock.mockResolvedValue(hosted);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); });
    await tick(0);
    expect(paymentMock).toHaveBeenCalledTimes(reads + 1);
    expect(screen.getByRole('link', { name: /Click here to Pay/ })).toBeTruthy();
  });
});

describe('the payment step', () => {
  const method = (patch: Partial<PaymentMethod> = {}): PaymentMethod => ({
    method: 'card', displayName: 'Card', type: 'gateway', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '',
    fee: 0, chargeTotal: 70, ...patch,
  });
  const quote = (patch: Partial<Quote> = {}): Quote => ({
    items: [], subtotal: 70, coupon: null, shippingOptions: [], selectedShippingOptionId: null, shippingAmount: 0,
    storeCredit: { balance: 0, applied: 0, remaining: 0 }, grandTotal: 70, amountDue: 70, paymentMethods: [method()],
    contactModes: { emailMode: 'required', phoneMode: 'off' } as unknown as Quote['contactModes'], ...patch,
  });
  const step = (q: Quote, extra: Partial<Parameters<typeof PaymentStep>[0]> = {}) =>
    render(
      <MantineProvider env="test">
        <PaymentStep quote={q} form={{ ...DEFAULT_FORM, paymentMethod: 'card' }} patch={() => undefined} errors={{}} guest currency="USD" {...extra} />
      </MantineProvider>,
    );

  it('shows no line when the fields are absent or the currency is the shop currency', () => {
    step(quote());
    expect(screen.queryByText(/Charged in/)).toBeNull();
    cleanup();
    step(quote({ paymentMethods: [method({ chargeCurrency: 'USD', settlementTotal: 70 })] }));
    expect(screen.queryByText(/Charged in/)).toBeNull();
  });

  it('shows "Charged in EUR: €65.25" for the chosen method, and the coin figure once a coin is chosen', () => {
    const crypto = method({
      method: 'crypto', type: 'crypto', chargeCurrency: 'EUR', settlementTotal: 65.25,
      cryptoOptions: [{ coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon', feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 70, chargeCurrency: 'EUR', settlementTotal: 64.1 }],
    });
    const q = quote({ paymentMethods: [crypto] });
    const form = { ...DEFAULT_FORM, paymentMethod: 'crypto' };
    const ui = (f: typeof form) => (
      <MantineProvider env="test"><PaymentStep quote={q} form={f} patch={() => undefined} errors={{}} guest currency="USD" /></MantineProvider>
    );
    const { rerender } = render(ui(form));
    expect(screen.getByText('Charged in EUR: €65.25')).toBeTruthy();
    rerender(ui({ ...form, coin: 'usdt', network: 'polygon' }));
    expect(screen.getByText('Charged in EUR: €64.10')).toBeTruthy();
  });

  it.each([
    ['partner_unreachable', /try again in a moment/i, true],
    ['rate_unavailable', /exchange rate.*try again in a moment/i, true],
    ['partner_not_ready', /isn.t available at this warehouse right now/, false],
  ] as const)('%s replaces the method list with its message', (value, text, retry) => {
    const onRetry = vi.fn();
    step(quote({ paymentMethods: [], paymentMethodsUnavailable: value }), { onRetryQuote: onRetry });
    expect(screen.getByRole('status').textContent).toMatch(text);
    expect(screen.queryByRole('radio')).toBeNull();
    const button = screen.queryByRole('button', { name: 'Try again' });
    expect(Boolean(button)).toBe(retry);
    if (button) {
      fireEvent.click(button);
      expect(onRetry).toHaveBeenCalledTimes(1);
    }
  });

  it('an amount fully covered by store credit is unaffected', () => {
    step(quote({ amountDue: 0, paymentMethods: [], paymentMethodsUnavailable: 'partner_unreachable' }));
    expect(screen.getByText(/store credit covers this order/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
