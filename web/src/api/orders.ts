import { api, unwrap, unwrapWithMeta } from '@/api/client.ts';
import type { OrderDetail, OrderSummary, PageMeta } from '@/types/orders.ts';

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
