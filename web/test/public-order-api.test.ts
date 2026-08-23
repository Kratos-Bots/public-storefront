import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidLinkError,
  PaymentConflictError,
  fetchPaymentOptions,
  fetchPublicOrder,
  selectPaymentMethod,
  submitCryptoTxid,
} from '@/api/public-order.ts';
import { ApiError, errorMessage } from '@/lib/errors.ts';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

interface SeenRequest {
  url: string;
  method: string;
  body: unknown;
}

/**
 * The request has to be read inside the mock: once a Request has been handed to
 * `fetch`, its body is spent and `spy.mock.calls[0][0].json()` throws.
 */
function captureFetch(status: number, body: unknown): SeenRequest[] {
  const seen: SeenRequest[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const request = input as Request;
    seen.push({
      url: request.url,
      method: request.method,
      body: request.body ? await request.clone().json() : null,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return seen;
}

const view = {
  reference: 'AB12CD',
  status: 'pending',
  createdAt: '2026-08-01T12:00:00.000Z',
  deliveredAt: null,
  isPreorder: false,
  currency: 'GBP',
  items: [],
  totals: { subtotal: 40, shippingAmount: 5, discountAmount: 0, taxAmount: 0, totalAmount: 45 },
  shippingAddress: null,
  shipments: [],
  cryptoPayments: [],
  payment: { canPay: true, payBy: null, activePayment: null },
};

afterEach(() => vi.restoreAllMocks());

describe('fetchPublicOrder', () => {
  it('reads the order by reference and access key', async () => {
    const spy = mockFetch(200, { success: true, data: view, error: null });
    await expect(fetchPublicOrder('AB12CD', 'k3y')).resolves.toEqual(view);
    expect((spy.mock.calls[0]![0] as Request).url).toContain('/api/orders/AB12CD/k3y');
  });

  it('escapes both credentials into the path', async () => {
    const spy = mockFetch(200, { success: true, data: view, error: null });
    await fetchPublicOrder('AB 12', 'a/b');
    expect((spy.mock.calls[0]![0] as Request).url).toContain('/api/orders/AB%2012/a%2Fb');
  });

  it.each([400, 403, 404])('reads %i as an unusable link', async (status) => {
    mockFetch(status, { success: false, data: null, error: 'Order not found' });
    await expect(fetchPublicOrder('AB12CD', 'wrong')).rejects.toBeInstanceOf(InvalidLinkError);
  });

  it('lets a server fault through as an ApiError so the retry screen shows', async () => {
    mockFetch(503, { success: false, data: null, error: 'Order lookup is not configured' });
    const err = await fetchPublicOrder('AB12CD', 'k3y').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(InvalidLinkError);
  });
});

describe('fetchPaymentOptions', () => {
  it('returns the methods this order can be paid with', async () => {
    const methods = [{ slot: 'card', method: 'sushipp', displayName: 'Sushipp', chargeTotal: 45 }];
    const spy = mockFetch(200, { success: true, data: methods, error: null });
    await expect(fetchPaymentOptions('AB12CD', 'k3y')).resolves.toEqual(methods);
    expect((spy.mock.calls[0]![0] as Request).url).toContain('/api/orders/AB12CD/k3y/payment-options');
  });

  it('reads an unusable link the same way the order view does', async () => {
    mockFetch(404, { success: false, data: null, error: 'Order not found' });
    await expect(fetchPaymentOptions('AB12CD', 'wrong')).rejects.toBeInstanceOf(InvalidLinkError);
  });
});

describe('selectPaymentMethod', () => {
  it('posts the method and, for crypto, the combo', async () => {
    const result = { paymentId: 9, method: 'oxapay', kind: 'crypto', status: 'pending', checkoutUrl: null, crypto: null };
    const seen = captureFetch(200, { success: true, data: result, error: null });
    await expect(
      selectPaymentMethod('AB12CD', 'k3y', { method: 'oxapay', coin: 'btc', network: 'bitcoin' }),
    ).resolves.toEqual(result);
    expect(seen[0]!.url).toContain('/api/orders/AB12CD/k3y/payment-method');
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.body).toEqual({ method: 'oxapay', coin: 'btc', network: 'bitcoin' });
  });

  it('reads 409 as the order having moved under us', async () => {
    mockFetch(409, { success: false, data: null, error: 'This order already has a completed payment' });
    await expect(selectPaymentMethod('AB12CD', 'k3y', { method: 'sushipp' })).rejects.toBeInstanceOf(
      PaymentConflictError,
    );
  });

  it('surfaces the backend’s own wording on a rejected method', async () => {
    mockFetch(400, { success: false, data: null, error: "Payment method 'store_credit' is not available online" });
    const err = await selectPaymentMethod('AB12CD', 'k3y', { method: 'store_credit' }).catch((e: unknown) => e);
    expect(errorMessage(err)).toBe("Payment method 'store_credit' is not available online");
  });

  it('reads 404 as an unusable link, not a conflict', async () => {
    mockFetch(404, { success: false, data: null, error: 'Order not found' });
    await expect(selectPaymentMethod('AB12CD', 'wrong', { method: 'sushipp' })).rejects.toBeInstanceOf(
      InvalidLinkError,
    );
  });
});

describe('submitCryptoTxid', () => {
  it('posts the payment id with the trimmed txid', async () => {
    const seen = captureFetch(200, { success: true, data: { verificationStatus: 'checking' }, error: null });
    await expect(submitCryptoTxid('AB12CD', 'k3y', 11, '  0xabc  ')).resolves.toBe('checking');
    expect(seen[0]!.url).toContain('/api/orders/AB12CD/k3y/crypto-txid');
    expect(seen[0]!.body).toEqual({ paymentId: 11, txid: '0xabc' });
  });

  it('reads back confirmed and needs_review verbatim, anything else as checking', async () => {
    mockFetch(200, { success: true, data: { verificationStatus: 'confirmed' }, error: null });
    await expect(submitCryptoTxid('AB12CD', 'k3y', 11, '0xabc')).resolves.toBe('confirmed');
    vi.restoreAllMocks();
    mockFetch(200, { success: true, data: { verificationStatus: 'needs_review' }, error: null });
    await expect(submitCryptoTxid('AB12CD', 'k3y', 11, '0xabc')).resolves.toBe('needs_review');
    vi.restoreAllMocks();
    mockFetch(200, { success: true, data: { verificationStatus: 'queued' }, error: null });
    await expect(submitCryptoTxid('AB12CD', 'k3y', 11, '0xabc')).resolves.toBe('checking');
  });

  it('tells the customer to wait when the rate limit trips', async () => {
    mockFetch(429, { success: false, data: null, error: 'Too many requests' });
    const err = await submitCryptoTxid('AB12CD', 'k3y', 11, '0xabc').catch((e: unknown) => e);
    expect(errorMessage(err)).toBe('Too many attempts — please wait a moment and try again');
  });

  it('surfaces a rejected txid in the backend’s own words', async () => {
    mockFetch(422, { success: false, data: null, error: 'That transaction has already been used' });
    const err = await submitCryptoTxid('AB12CD', 'k3y', 11, '0xabc').catch((e: unknown) => e);
    expect(errorMessage(err)).toBe('That transaction has already been used');
  });
});
