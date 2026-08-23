import { describe, expect, it } from 'vitest';
import type { CheckoutResult } from '@/types/checkout.ts';
import { publicOrderPath, resolveCheckoutOutcome } from '@/features/checkout/outcome.ts';

function result(overrides: Partial<CheckoutResult> = {}): CheckoutResult {
  return {
    reference: 'K7M2QP',
    publicUrl: null,
    status: 'pending',
    total: 78.13,
    payment: { type: 'none' },
    ...overrides,
  };
}

describe('publicOrderPath', () => {
  it('returns null for a null publicUrl', () => {
    expect(publicOrderPath(null)).toBeNull();
  });

  it('returns the pathname for a same-origin order URL', () => {
    expect(publicOrderPath(`${window.location.origin}/order/K7M2QP/ab12cd34`)).toBe('/order/K7M2QP/ab12cd34');
  });

  it('returns null for a foreign-origin URL even with the right path shape', () => {
    expect(publicOrderPath('https://evil.example/order/K7M2QP/ab12cd34')).toBeNull();
  });

  it('returns null when the path does not match /order/:ref/:key', () => {
    expect(publicOrderPath(`${window.location.origin}/orders/K7M2QP`)).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(publicOrderPath('not a url at all :: ///')).toBeNull();
  });
});

describe('resolveCheckoutOutcome', () => {
  it('sends a hosted checkout_url payment off-site', () => {
    const r = result({ payment: { type: 'checkout_url', paymentId: 991, method: 'stripe', amount: 58.13, url: 'https://checkout.stripe.com/abc' } });
    expect(resolveCheckoutOutcome(r)).toEqual({ kind: 'external', url: 'https://checkout.stripe.com/abc' });
  });

  it('navigates a crypto payment to the same-origin public order page', () => {
    const publicUrl = `${window.location.origin}/order/K7M2QP/ab12cd34`;
    const r = result({
      publicUrl,
      payment: {
        type: 'crypto', paymentId: 991, method: 'crypto', coin: 'btc', network: 'bitcoin',
        coinLabel: 'Bitcoin', networkLabel: 'Bitcoin', address: 'bc1q...', coinAmount: '0.00081234',
        fiatAmount: 55.28, qrData: 'bitcoin:bc1q...', walletLinks: [],
      },
    });
    expect(resolveCheckoutOutcome(r)).toEqual({ kind: 'navigate', to: '/order/K7M2QP/ab12cd34' });
  });

  it('navigates a manual payment to the same-origin public order page', () => {
    const publicUrl = `${window.location.origin}/order/K7M2QP/ab12cd34`;
    const r = result({
      publicUrl,
      payment: { type: 'manual', paymentId: 991, method: 'uk_bank_transfer', displayName: 'UK Bank Transfer', amount: 76.99, instructions: {} },
    });
    expect(resolveCheckoutOutcome(r)).toEqual({ kind: 'navigate', to: '/order/K7M2QP/ab12cd34' });
  });

  it('falls back to /order-placed for a crypto payment whose publicUrl is off-site', () => {
    const r = result({
      publicUrl: 'https://evil.example/order/K7M2QP/ab12cd34',
      payment: {
        type: 'crypto', paymentId: 991, method: 'crypto', coin: 'btc', network: 'bitcoin',
        coinLabel: 'Bitcoin', networkLabel: 'Bitcoin', address: 'bc1q...', coinAmount: '0.00081234',
        fiatAmount: 55.28, qrData: 'bitcoin:bc1q...', walletLinks: [],
      },
    });
    expect(resolveCheckoutOutcome(r)).toEqual({ kind: 'navigate', to: '/order-placed?order=K7M2QP' });
  });

  it('falls back to /order-placed for a "none" payment with no publicUrl', () => {
    const r = result({ publicUrl: null, payment: { type: 'none' } });
    expect(resolveCheckoutOutcome(r)).toEqual({ kind: 'navigate', to: '/order-placed?order=K7M2QP' });
  });

  it('carries a warning flag into the /order-placed fallback', () => {
    const r = result({ publicUrl: null, payment: { type: 'none' }, warning: 'Payment could not be started' });
    expect(resolveCheckoutOutcome(r)).toEqual({ kind: 'navigate', to: '/order-placed?order=K7M2QP&warning=1' });
  });

  it('still falls back to /order-placed for a "none" payment even when publicUrl resolves', () => {
    // payment.type === 'none' is excluded from the "use the order page" branch even
    // though a publicUrl exists — nothing was actually charged yet to show there.
    const publicUrl = `${window.location.origin}/order/K7M2QP/ab12cd34`;
    const r = result({ publicUrl, payment: { type: 'none' } });
    expect(resolveCheckoutOutcome(r)).toEqual({ kind: 'navigate', to: '/order-placed?order=K7M2QP' });
  });
});
