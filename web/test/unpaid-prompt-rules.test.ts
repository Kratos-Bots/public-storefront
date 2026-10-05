import { describe, expect, it } from 'vitest';
import { fromUnpaid, promptAllowedOn } from '@/features/unpaid-prompt/rules.ts';

describe('promptAllowedOn', () => {
  it.each(['/', '/catalog', '/product/12', '/cart', '/account', '/account/orders', '/account/profile', '/track'])('shows on %s', (p) => {
    expect(promptAllowedOn(p)).toBe(true);
  });
  it.each([
    '/checkout', '/checkout/', '/order/K4M2QP/abc', '/payment/success', '/payment/cancel', '/order-placed',
    '/account/orders/K4M2QP', '/login', '/login/code', '/auth/telegram/callback', '/__builder',
    '/reset-password', '/verify-email', '/verify/ABC123/xyz', '/verify', '/tracking', '/tracking/K4M2QP',
  ])('never shows on %s', (p) => {
    expect(promptAllowedOn(p)).toBe(false);
  });
});

describe('prompt order', () => {
  it('an unpaid order is reviewed on its account page', () => {
    expect(fromUnpaid({ reference: 'K4M2QP', createdAt: '', totalAmount: 46.03, outstandingBalance: 46.03, payBy: null, canCancel: true, cancelBlockedBy: null }))
      .toEqual({ reference: 'K4M2QP', amount: 46.03, reviewPath: '/account/orders/K4M2QP' });
  });
  it('encodes a reference that needs it', () => {
    expect(fromUnpaid({ reference: 'A/1', createdAt: '', totalAmount: 1, outstandingBalance: 1, payBy: null, canCancel: false, cancelBlockedBy: 'paid' }).reviewPath).toBe('/account/orders/A%2F1');
  });
});
