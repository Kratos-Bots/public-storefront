import { api, unwrap, unwrapWithMeta } from '@/api/client.ts';
import { ApiError } from '@/lib/errors.ts';
import type { PaymentMethod } from '@/types/checkout.ts';
import type { OrderDetail, OrderSummary, PageMeta, UnpaidOrder } from '@/types/orders.ts';
import type { CryptoTxidVerification, PublicOrder, SelectPaymentResult } from '@/types/public-order.ts';

/** 409 — the order's payment state moved under us (paid, cancelled, no longer pending). */
export class PaymentConflictError extends Error {
  constructor() {
    super('Order payment state changed');
    this.name = 'PaymentConflictError';
  }
}

/** 409 `ORDER_NOT_CANCELLABLE:<reason>` — the order cannot be cancelled by the customer (any more). */
export class OrderNotCancellableError extends Error {
  readonly reason: 'not_pending' | 'paid' | 'bank_transfer' | 'crypto_submitted';
  constructor(reason: OrderNotCancellableError['reason']) {
    super('Order cannot be cancelled');
    this.name = 'OrderNotCancellableError';
    this.reason = reason;
  }
}

const CANCEL_REASONS = ['not_pending', 'paid', 'bank_transfer', 'crypto_submitted'] as const;

/** Maps the backend's `409 ORDER_NOT_CANCELLABLE:<reason>`; anything else (including any other 409) is rethrown. */
export function asCancelError(err: unknown): never {
  if (err instanceof ApiError && err.status === 409 && err.message.startsWith('ORDER_NOT_CANCELLABLE')) {
    const reason = err.message.split(':')[1];
    throw new OrderNotCancellableError(CANCEL_REASONS.find((r) => r === reason) ?? 'not_pending');
  }
  throw err;
}

export interface PaymentSelection {
  method: string;
  coin?: string;
  network?: string;
}

/**
 * The customer's own order history. Ownership is the session's, so there is no
 * access key here: a reference belonging to anyone else 404s exactly like an
 * unknown one.
 */
export const fetchOrders = (page: number, limit: number) =>
  unwrapWithMeta<OrderSummary[], PageMeta>(
    api.get('storefront/orders', { searchParams: { page, limit } }),
  );

export const fetchOrder = (reference: string) =>
  unwrap<OrderDetail>(api.get(`storefront/orders/${encodeURIComponent(reference)}`));

/** Cancel the signed-in customer's own unpaid order. */
export const cancelOrder = (reference: string) =>
  unwrap<{ reference: string; status: string }>(api.post(`storefront/orders/${encodeURIComponent(reference)}/cancel`)).catch(asCancelError);

/** The signed-in customer's orders that can still be paid (newest first, at most five). */
export const fetchUnpaidOrders = () => unwrap<UnpaidOrder[]>(api.get('storefront/orders/unpaid', { retry: 0 }));

/** A pay route answered 404: the order is not this customer's, or no longer exists. */
export class OrderGoneError extends Error {
  constructor() {
    super('Order not found');
    this.name = 'OrderGoneError';
  }
}

const orderBase = (reference: string) => `storefront/orders/${encodeURIComponent(reference)}`;

/** 404 alone: a 422 on the action routes is the backend's own customer-written message about the method or the txid. */
function asGone(err: unknown): never {
  if (err instanceof ApiError && err.status === 404) throw new OrderGoneError();
  throw err;
}

/** What is owed on the order and how it stands: `payment.canPay`, the active payment, crypto payments, the address. */
export const fetchOrderPayment = (reference: string) =>
  unwrap<PublicOrder>(api.get(`${orderBase(reference)}/payment`)).catch(asGone);

/** The methods this order can be paid with right now; `[]` once it can no longer be paid. */
export const fetchOrderPaymentOptions = (reference: string) =>
  unwrap<PaymentMethod[]>(api.get(`${orderBase(reference)}/payment-options`)).catch(asGone);

/** Create the order's first payment or switch a pending one. A 409 means the order moved on: the caller refetches. */
export const selectOrderPaymentMethod = (reference: string, selection: PaymentSelection) =>
  unwrap<SelectPaymentResult>(api.post(`${orderBase(reference)}/payment-method`, { json: selection })).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 409) throw new PaymentConflictError();
    return asGone(err);
  });

/** Submit the transaction id of a static-crypto payment. A rejected id carries a customer-written message. */
export async function submitOrderCryptoTxid(reference: string, paymentId: number, txid: string): Promise<CryptoTxidVerification> {
  const data = await unwrap<{ verificationStatus?: string }>(
    api.post(`${orderBase(reference)}/crypto-txid`, { json: { paymentId, txid: txid.trim() } }),
  ).catch(asGone);
  return data.verificationStatus === 'confirmed' || data.verificationStatus === 'needs_review' ? data.verificationStatus : 'checking';
}
