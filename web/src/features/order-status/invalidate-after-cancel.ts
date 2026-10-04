import type { QueryClient } from '@tanstack/react-query';
import { publicOrderKey } from '@/features/order-status/queries.ts';

/**
 * Every view that shows an order's cancel state, refreshed after a cancel (or a refusal): the account's order
 * and orders list, the public order page when the order's link is known, and the unpaid-order pop-up's lookups.
 * The one rule for all three places that offer the control, so they cannot drift apart.
 */
export function invalidateAfterCancel(queryClient: QueryClient, reference: string, accessKey?: string | null): void {
  void queryClient.invalidateQueries({ queryKey: ['orders'] });
  void queryClient.invalidateQueries({ queryKey: ['order', reference] });
  if (accessKey) void queryClient.invalidateQueries({ queryKey: publicOrderKey(reference, accessKey) });
  void queryClient.invalidateQueries({ queryKey: ['unpaid-prompt'] });
}
