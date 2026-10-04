import { describe, expect, it } from 'vitest';
import { fromPublic, fromUnpaid, guestCandidates, isTerminalStatus, promptAllowedOn } from '@/features/unpaid-prompt/rules.ts';

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

describe('isTerminalStatus', () => {
  it('is true only for cancelled and refunded', () => {
    expect(['cancelled', 'refunded'].map(isTerminalStatus)).toEqual([true, true]);
    expect(['pending', 'processing', 'shipped', 'completed', undefined].map(isTerminalStatus)).toEqual([false, false, false, false, false]);
  });
});

describe('guestCandidates', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const saved = (reference: string, daysAgo: number) => ({ reference, accessKey: `k-${reference}`, savedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() });
  it('takes the three most recent saved orders', () => {
    expect(guestCandidates([saved('A', 0), saved('B', 1), saved('C', 2), saved('D', 3)], now).map((s) => s.reference)).toEqual(['A', 'B', 'C']);
  });
  it('drops anything older than 14 days or with an unreadable date', () => {
    expect(guestCandidates([saved('A', 15), { reference: 'B', accessKey: 'k', savedAt: 'nonsense' }, saved('C', 13)], now).map((s) => s.reference)).toEqual(['C']);
  });
  it('is empty with nothing saved', () => {
    expect(guestCandidates([], now)).toEqual([]);
  });
});

describe('prompt order', () => {
  it('a signed-in unpaid order goes to its account page', () => {
    expect(fromUnpaid({ reference: 'K4M2QP', accessKey: 'abc', createdAt: '', totalAmount: 46.03, outstandingBalance: 46.03, payBy: null, canCancel: true, cancelBlockedBy: null }))
      .toEqual({ reference: 'K4M2QP', accessKey: 'abc', amount: 46.03, payPath: '/account/orders/K4M2QP', viaLink: false, canCancel: true, cancelBlockedBy: null });
  });
  it('a guest order goes to its order link, and only when it can still be paid', () => {
    const order = { reference: 'K4M2QP', totals: { totalAmount: 46.03 }, payment: { canPay: true, payBy: null, activePayment: null, canCancel: false, cancelBlockedBy: 'bank_transfer' } };
    expect(fromPublic({ reference: 'K4M2QP', accessKey: 'abc', savedAt: '' }, order as never))
      .toEqual({ reference: 'K4M2QP', accessKey: 'abc', amount: 46.03, payPath: '/order/K4M2QP/abc', viaLink: true, canCancel: false, cancelBlockedBy: 'bank_transfer' });
    expect(fromPublic({ reference: 'K4M2QP', accessKey: 'abc', savedAt: '' }, { ...order, payment: { ...order.payment, canPay: false } } as never)).toBeNull();
    expect(fromPublic({ reference: 'K4M2QP', accessKey: 'abc', savedAt: '' }, { reference: 'K4M2QP', totals: { totalAmount: 1 } } as never)).toBeNull();
  });
});
