import { api, unwrap, unwrapWithMeta } from '@/api/client.ts';
import { asCancelError } from '@/api/public-order.ts';
import type { OrderDetail, OrderSummary, PageMeta, UnpaidOrder } from '@/types/orders.ts';

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
