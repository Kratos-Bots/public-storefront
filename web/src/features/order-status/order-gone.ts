import type { QueryClient } from '@tanstack/react-query';
import { orderPaymentKey } from '@/features/order-status/queries.ts';

/**
 * A pay route or the cancel route answered 404: the order is not this customer's any more (or never was). The
 * account order read 404s too, so refreshing it is what puts the page's own not-found screen up; the message
 * for the failed action is dropped, since "try again" can never work.
 */
export function invalidateOrderGone(queryClient: QueryClient, reference: string): void {
  void queryClient.invalidateQueries({ queryKey: ['order', reference] });
  void queryClient.invalidateQueries({ queryKey: ['orders'] });
  void queryClient.invalidateQueries({ queryKey: orderPaymentKey(reference) });
}
