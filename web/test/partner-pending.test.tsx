import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  PARTNER_POLL_MS,
  PARTNER_WINDOW_MS,
  partnerElapsed,
  usePartnerPendingPhase,
} from '@/features/order-status/partner-pending.ts';
import { paymentPollInterval } from '@/features/order-status/payment-state.ts';
import type { PublicOrder } from '@/types/public-order.ts';

const order = (partnerPending: boolean): PublicOrder => ({
  reference: 'K4M2QP', status: 'pending', createdAt: '2026-01-02T10:00:00Z', deliveredAt: null, isPreorder: false, currency: 'USD',
  items: [], totals: { subtotal: 40, shippingAmount: 0, discountAmount: 0, taxAmount: 0, totalAmount: 40 },
  shippingAddress: null, shipments: [], cryptoPayments: [],
  payment: { canPay: true, payBy: null, activePayment: null, ...(partnerPending ? { partnerPending: true as const } : {}) },
});

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('partner pending polling', () => {
  it('polls every 5 s while pending, and stops once the 2 minute window is spent', () => {
    const state = { data: order(true), status: 'success' as const };
    expect(PARTNER_POLL_MS).toBe(5_000);
    expect(paymentPollInterval(state, 0, 0)).toBe(5_000);
    expect(paymentPollInterval(state, 0, PARTNER_WINDOW_MS - 1)).toBe(5_000);
    expect(paymentPollInterval(state, 0, PARTNER_WINDOW_MS)).toBe(false);
  });
  it('is the ordinary interval when the order is not pending on a partner', () => {
    expect(paymentPollInterval({ data: order(false), status: 'success' }, 0, 0)).toBe(30_000);
  });
});

describe('usePartnerPendingPhase', () => {
  it('waits, then times out after 2 minutes', () => {
    const { result } = renderHook(() => usePartnerPendingPhase('K4M2QP', true));
    expect(result.current).toBe('waiting');
    act(() => { vi.advanceTimersByTime(PARTNER_WINDOW_MS - 1); });
    expect(result.current).toBe('waiting');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('timedOut');
  });
  it('is waiting again when the payment appears and a later one goes pending', () => {
    const { result, rerender } = renderHook(({ p }) => usePartnerPendingPhase('K4M2QP', p), { initialProps: { p: true } });
    act(() => { vi.advanceTimersByTime(PARTNER_WINDOW_MS); });
    expect(result.current).toBe('timedOut');
    rerender({ p: false });
    expect(partnerElapsed('K4M2QP')).toBeNull();
    rerender({ p: true });
    expect(result.current).toBe('waiting');
  });
  it('shares one clock with the poll', () => {
    renderHook(() => usePartnerPendingPhase('K4M2QP', true));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(partnerElapsed('K4M2QP')).toBe(30_000);
  });
});

