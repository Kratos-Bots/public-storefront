import type { QueryClient } from '@tanstack/react-query';
import { orderPaymentKey } from '@/features/order-status/queries.ts';

/**
 * Every view that shows an order's cancel state, refreshed after a cancel (or a refusal): the account's order,
 * the orders list (which also holds the unpaid-order pop-up's lookup under `['orders', 'unpaid', id]`) and the
 * order's payment view. The one rule for every place that offers the control, so they cannot drift apart.
 */
export function invalidateAfterCancel(queryClient: QueryClient, reference: string): void {
  void queryClient.invalidateQueries({ queryKey: ['orders'] });
  void queryClient.invalidateQueries({ queryKey: ['order', reference] });
  void queryClient.invalidateQueries({ queryKey: orderPaymentKey(reference) });
}
