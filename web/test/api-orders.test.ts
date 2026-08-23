import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOrder, fetchOrders } from '@/api/orders.ts';
import { fetchRedeemOptions } from '@/api/profile.ts';
import { useSessionStore } from '@/stores/session.ts';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

const summary = {
  reference: 'AB12CD',
  status: 'shipped',
  createdAt: '2026-08-01T12:00:00.000Z',
  totalAmount: 45,
  outstandingBalance: 0,
};

const meta = { page: 2, limit: 10, totalItems: 24, totalPages: 3, hasNextPage: true, hasPrevPage: true };

describe('fetchOrders', () => {
  beforeEach(() => useSessionStore.getState().clear());
  afterEach(() => vi.restoreAllMocks());

  it('returns the page and its pagination meta', async () => {
    mockFetch(200, { success: true, data: [summary], error: null, meta });
    await expect(fetchOrders(2, 10)).resolves.toEqual({ data: [summary], meta });
  });

  it('asks for the requested page and limit', async () => {
    const spy = mockFetch(200, { success: true, data: [], error: null, meta });
    await fetchOrders(3, 20);
    const url = (spy.mock.calls[0]![0] as Request).url;
    expect(url).toContain('storefront/orders');
    expect(url).toContain('page=3');
    expect(url).toContain('limit=20');
  });
});

describe('fetchOrder', () => {
  beforeEach(() => useSessionStore.getState().clear());
  afterEach(() => vi.restoreAllMocks());

  it('reads one order by reference', async () => {
    const detail = {
      ...summary,
      items: [{ name: 'Widget', quantity: 2, unitPrice: 10, lineTotal: 20 }],
      subtotal: 20,
      shippingAmount: 5,
      discountAmount: 0,
      payments: [{ method: 'stripe', amount: 25, status: 'completed', createdAt: '2026-08-01T12:01:00.000Z' }],
      shipments: [],
      publicUrl: 'https://order.example.com/AB12CD/0f3a',
    };
    const spy = mockFetch(200, { success: true, data: detail, error: null });
    await expect(fetchOrder('AB12CD')).resolves.toEqual(detail);
    expect((spy.mock.calls[0]![0] as Request).url).toContain('storefront/orders/AB12CD');
  });
});

describe('fetchRedeemOptions', () => {
  beforeEach(() => useSessionStore.getState().clear());
  afterEach(() => vi.restoreAllMocks());

  it('reads null when redemption is switched off', async () => {
    mockFetch(404, { success: false, data: null, error: 'Feature not found' });
    await expect(fetchRedeemOptions()).resolves.toBeNull();
  });

  it('returns the options when the feature is on', async () => {
    const options = {
      loyaltyPoints: 120,
      options: [{ id: 1, label: '£5 credit', pointsCost: 500, creditValue: 5, affordable: false }],
    };
    mockFetch(200, { success: true, data: options, error: null });
    await expect(fetchRedeemOptions()).resolves.toEqual(options);
  });

  it('lets any other failure through', async () => {
    mockFetch(500, { success: false, data: null, error: 'Boom' });
    await expect(fetchRedeemOptions()).rejects.toMatchObject({ status: 500 });
  });
});
