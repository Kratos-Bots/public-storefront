import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelOrder, fetchOrder, fetchOrderPayment, fetchOrderPaymentOptions, fetchOrders, fetchUnpaidOrders,
  OrderGoneError, OrderNotCancellableError, PaymentConflictError, selectOrderPaymentMethod, submitOrderCryptoTxid,
} from '@/api/orders.ts';
import { fetchRedeemOptions } from '@/api/profile.ts';
import { useSessionStore } from '@/stores/session.ts';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

// ky/undici consume the request body, so it is read inside the fetch mock.
function mockPost(status: number, body: unknown) {
  const sent: { url: string; method: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const req = input as Request;
    sent.push({ url: req.url, method: req.method, body: req.body ? await req.clone().json() : null });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
  return sent;
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

describe('cancelOrder', () => {
  beforeEach(() => useSessionStore.getState().clear());
  afterEach(() => vi.restoreAllMocks());

  it('POSTs to the session cancel route', async () => {
    const spy = mockFetch(200, { success: true, data: { reference: 'AB12CD', status: 'cancelled' }, error: null });
    await expect(cancelOrder('AB12CD')).resolves.toEqual({ reference: 'AB12CD', status: 'cancelled' });
    const req = spy.mock.calls[0]![0] as Request;
    expect(req.method).toBe('POST');
    expect(req.url).toContain('storefront/orders/AB12CD/cancel');
  });

  it('a 404 reads as "no longer waiting for payment"', async () => {
    mockFetch(404, { success: false, data: null, error: 'Order not found' });
    const err = await cancelOrder('AB12CD').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrderNotCancellableError);
    expect((err as OrderNotCancellableError).reason).toBe('not_pending');
  });

  it('any other failure is rethrown as it came', async () => {
    mockFetch(500, { success: false, data: null, error: 'Boom' });
    await expect(cancelOrder('AB12CD')).rejects.toMatchObject({ status: 500 });
  });

  it('maps 409 ORDER_NOT_CANCELLABLE:<reason> to OrderNotCancellableError', async () => {
    mockFetch(409, { success: false, data: null, error: 'ORDER_NOT_CANCELLABLE:bank_transfer' });
    const err = await cancelOrder('AB12CD').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrderNotCancellableError);
    expect((err as OrderNotCancellableError).reason).toBe('bank_transfer');
  });

  it('treats an unknown reason as not_pending', async () => {
    mockFetch(409, { success: false, data: null, error: 'ORDER_NOT_CANCELLABLE:zzz' });
    const err = await cancelOrder('AB12CD').catch((e: unknown) => e);
    expect((err as OrderNotCancellableError).reason).toBe('not_pending');
  });
});

describe('fetchUnpaidOrders', () => {
  beforeEach(() => useSessionStore.getState().clear());
  afterEach(() => vi.restoreAllMocks());

  it('GETs storefront/orders/unpaid', async () => {
    const spy = mockFetch(200, { success: true, data: [], error: null });
    await expect(fetchUnpaidOrders()).resolves.toEqual([]);
    const req = spy.mock.calls[0]![0] as Request;
    expect(req.method).toBe('GET');
    expect(req.url).toContain('storefront/orders/unpaid');
  });
});

describe('order payment through the session', () => {
  beforeEach(() => useSessionStore.getState().clear());
  afterEach(() => vi.restoreAllMocks());

  it('reads the payment view from storefront/orders/:ref/payment, encoding the reference', async () => {
    const spy = mockFetch(200, { success: true, data: { reference: 'A/1' }, error: null });
    await fetchOrderPayment('A/1');
    expect((spy.mock.calls[0]![0] as Request).url).toContain('storefront/orders/A%2F1/payment');
    expect((spy.mock.calls[0]![0] as Request).method).toBe('GET');
  });

  it('does not retry a failed payment read at the transport level (the route is rate limited)', async () => {
    const spy = mockFetch(500, { success: false, data: null, error: 'Boom' });
    await expect(fetchOrderPayment('K4M2QP')).rejects.toMatchObject({ status: 500 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reads payment options', async () => {
    const spy = mockFetch(200, { success: true, data: [], error: null });
    expect(await fetchOrderPaymentOptions('K4M2QP')).toEqual([]);
    expect((spy.mock.calls[0]![0] as Request).url).toContain('storefront/orders/K4M2QP/payment-options');
    expect((spy.mock.calls[0]![0] as Request).method).toBe('GET');
  });

  it('posts a selection, and a 409 becomes PaymentConflictError', async () => {
    const sent = mockPost(409, { success: false, data: null, error: 'This order is no longer awaiting payment' });
    await expect(selectOrderPaymentMethod('K4M2QP', { method: 'stripe' })).rejects.toBeInstanceOf(PaymentConflictError);
    expect(sent[0]!.method).toBe('POST');
    expect(sent[0]!.url).toContain('storefront/orders/K4M2QP/payment-method');
    expect(sent[0]!.body).toEqual({ method: 'stripe' });
  });

  it('a 422 on selection keeps the backend message for the customer', async () => {
    mockFetch(422, { success: false, data: null, error: 'That payment method is not available for this order' });
    await expect(selectOrderPaymentMethod('K4M2QP', { method: 'x' })).rejects.toMatchObject({
      status: 422,
      message: 'That payment method is not available for this order',
    });
  });

  it('a 404 on any pay route is OrderGoneError', async () => {
    mockFetch(404, { success: false, data: null, error: 'Order not found' });
    await expect(fetchOrderPayment('K4M2QP')).rejects.toBeInstanceOf(OrderGoneError);
  });

  it.each([
    ['payment-options', () => fetchOrderPaymentOptions('K4M2QP')],
    ['payment-method', () => selectOrderPaymentMethod('K4M2QP', { method: 'stripe' })],
    ['crypto-txid', () => submitOrderCryptoTxid('K4M2QP', 9, 'abc1234567')],
  ])('a 404 on %s is OrderGoneError too', async (_name, call) => {
    mockFetch(404, { success: false, data: null, error: 'Order not found' });
    await expect(call()).rejects.toBeInstanceOf(OrderGoneError);
  });

  it.each(['confirmed', 'needs_review'])('passes a %s txid result through verbatim', async (status) => {
    mockPost(200, { success: true, data: { verificationStatus: status }, error: null });
    expect(await submitOrderCryptoTxid('K4M2QP', 9, 'abc1234567')).toBe(status);
  });

  it('a 503 stays an ApiError so the page can offer a retry', async () => {
    mockFetch(503, { success: false, data: null, error: 'STOREFRONT_DISABLED' });
    await expect(fetchOrderPayment('K4M2QP')).rejects.toMatchObject({ status: 503 });
  });

  it('submits a trimmed txid and maps unknown statuses to checking', async () => {
    const sent = mockPost(200, { success: true, data: { verificationStatus: 'something-new' }, error: null });
    expect(await submitOrderCryptoTxid('K4M2QP', 9, '  abc1234567  ')).toBe('checking');
    expect(sent[0]!.url).toContain('storefront/orders/K4M2QP/crypto-txid');
    expect(sent[0]!.body).toEqual({ paymentId: 9, txid: 'abc1234567' });
  });
});
