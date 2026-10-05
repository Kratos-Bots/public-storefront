import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PaymentMethod } from '@/types/checkout.ts';
import type { ActivePayment, PublicOrder } from '@/types/public-order.ts';

vi.mock('@/api/orders.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/orders.ts')>()),
  fetchOrderPaymentOptions: vi.fn(),
  selectOrderPaymentMethod: vi.fn(),
}));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ brand: { links: { whatsapp: null, telegram: null } } }),
}));

import { fetchOrderPaymentOptions } from '@/api/orders.ts';
import { formatAmountPlain } from '@/lib/format.ts';
import { settlementQuote } from '@/features/order-status/payment-state.ts';
import { MethodPicker } from '@/features/order-status/MethodPicker.tsx';

const bank: PaymentMethod = {
  slot: 'manual',
  method: 'uk_bank_transfer',
  displayName: 'UK Bank Transfer',
  type: 'offline',
  details: { 'Account name': 'Shop Ltd', 'Sort code': '12-34-56', 'Account number': '12345678' },
  feeType: null,
  feeValue: null,
  feeRateText: '',
  feeLabel: '',
  fee: 0,
  chargeTotal: 83,
};
const card: PaymentMethod = { ...bank, slot: 'card', method: 'stripe', displayName: 'Card', type: 'gateway', details: null };

function active(patch: Partial<ActivePayment> = {}): ActivePayment {
  return {
    paymentId: 7,
    method: 'uk_bank_transfer',
    kind: 'other',
    status: 'pending',
    checkoutUrl: null,
    canChange: true,
    settlementAmount: 65.65,
    settlementCurrency: 'GBP',
    ...patch,
  };
}

function order(activePayment: ActivePayment | null): PublicOrder {
  return {
    reference: 'AB12CD',
    status: 'pending',
    createdAt: '2026-09-01T12:00:00.000Z',
    deliveredAt: null,
    isPreorder: false,
    currency: 'USD',
    items: [],
    totals: { subtotal: 78, shippingAmount: 5, discountAmount: 0, taxAmount: 0, totalAmount: 83 },
    shippingAddress: null,
    shipments: [],
    payment: { canPay: true, payBy: null, activePayment },
  };
}

describe('formatAmountPlain', () => {
  it('drops the symbol and grouping and keeps the currency decimals', () => {
    expect(formatAmountPlain(65.65, 'GBP')).toBe('65.65');
    expect(formatAmountPlain(1234.5, 'GBP')).toBe('1234.50');
    expect(formatAmountPlain(1234.4, 'JPY')).toBe('1234');
  });
});

describe('settlementQuote', () => {
  it('returns the quote for the pending payment of the same method', () => {
    expect(settlementQuote(order(active()), bank)).toEqual({ amount: 65.65, currency: 'GBP' });
  });

  it('never shows one method’s quote against another', () => {
    expect(settlementQuote(order(active()), card)).toBeNull();
  });

  it('is null without a quote, a pending payment, or on an older backend', () => {
    expect(settlementQuote(order(active({ settlementAmount: null, settlementCurrency: null })), bank)).toBeNull();
    expect(settlementQuote(order(active({ settlementAmount: undefined, settlementCurrency: undefined })), bank)).toBeNull();
    expect(settlementQuote(order(active({ status: 'failed' })), bank)).toBeNull();
    expect(settlementQuote(order(null), bank)).toBeNull();
  });
});

describe('MethodPicker bank transfer details', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  async function openBankTransfer(o: PublicOrder) {
    vi.mocked(fetchOrderPaymentOptions).mockResolvedValue([card, bank]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MethodPicker order={o} reference="AB12CD" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /UK Bank Transfer/ }));
  }

  it('shows the amount to send, in the settlement currency, before the reference', async () => {
    await openBankTransfer(order(active()));
    const amount = screen.getByText('£65.65');
    expect(screen.getByText('Amount to send')).toBeInTheDocument();
    const reference = screen.getByText('Payment reference');
    expect(amount.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('copies the bare number for a banking app’s amount field', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await openBankTransfer(order(active()));
    fireEvent.click(screen.getByRole('button', { name: 'Copy amount to send' }));
    expect(writeText).toHaveBeenCalledWith('65.65');
  });

  it('shows no amount row without a quote', async () => {
    await openBankTransfer(order(active({ settlementAmount: null, settlementCurrency: null })));
    expect(screen.getByText('Payment reference')).toBeInTheDocument();
    expect(screen.queryByText('Amount to send')).not.toBeInTheDocument();
  });

  it('shows no amount row when the quote belongs to another method', async () => {
    await openBankTransfer(order(active({ method: 'monzo' })));
    expect(screen.queryByText('Amount to send')).not.toBeInTheDocument();
  });
});
