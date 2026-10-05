import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchOrder, fetchOrderPayment, fetchOrders } from '@/api/orders.ts';
import { orderPaymentKey } from '@/features/order-status/queries.ts';
import { paymentPollInterval } from '@/features/order-status/payment-state.ts';
import { fetchProfile, fetchRedeemOptions } from '@/api/profile.ts';

export const PROFILE_KEY = ['profile'] as const;
export const REDEEM_OPTIONS_KEY = ['redeem-options'] as const;
export const ORDERS_KEY = ['orders'] as const;

/** Enough rows to fill a phone twice over without a second request. */
export const ORDERS_PAGE_SIZE = 10;

/**
 * The customer's standing. Read by four of the five account surfaces, so it is
 * one query with one cache entry — a tab change re-reads nothing.
 */
export function useProfile(enabled = true) {
  return useQuery({ queryKey: PROFILE_KEY, queryFn: fetchProfile, staleTime: 30_000, enabled });
}

/** `null` data means the shop has redemption switched off, not that it failed. */
export function useRedeemOptions(enabled = true) {
  return useQuery({
    queryKey: REDEEM_OPTIONS_KEY,
    queryFn: fetchRedeemOptions,
    staleTime: 30_000,
    enabled,
  });
}

export function useOrders(enabled = true) {
  return useInfiniteQuery({
    queryKey: ORDERS_KEY,
    queryFn: ({ pageParam }) => fetchOrders(pageParam, ORDERS_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNextPage ? last.meta.page + 1 : undefined),
    staleTime: 30_000,
    enabled,
  });
}

export function useOrder(reference: string | undefined) {
  return useQuery({
    queryKey: ['order', reference] as const,
    queryFn: () => fetchOrder(reference as string),
    enabled: !!reference,
  });
}

/**
 * What is owed on the order and how its payment stands, through the session. Polled while a payment is open
 * (the interval comes from the order's own state) and in the background: a customer finishing a hosted checkout
 * in another tab is not looking at this one, and that is when it most needs to keep up.
 */
export function useOrderPayment(reference: string, enabled: boolean) {
  return useQuery({
    queryKey: orderPaymentKey(reference),
    queryFn: () => fetchOrderPayment(reference),
    enabled,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => paymentPollInterval(query.state),
    refetchIntervalInBackground: true,
  });
}
