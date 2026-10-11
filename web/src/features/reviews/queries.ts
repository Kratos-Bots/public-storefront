import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchReviews, submitReview } from '@/api/reviews.ts';
import { useSessionStore } from '@/stores/session.ts';
import type { SubmitReviewBody } from '@/types/reviews.ts';

// Orders this customer has reviewed (or found already reviewed) during this page load. A cached reminder list
// can still name one until it is refreshed, and the reminder must not ask about an order that was just reviewed.
const reviewedThisLoad = new Set<string>();
const reviewedKey = (customerId: number | null, reference: string) => `${customerId ?? ''}:${reference}`;
export const isReviewedThisLoad = (customerId: number | null, reference: string) => reviewedThisLoad.has(reviewedKey(customerId, reference));
/** Tests stand in for a page load. */
export const resetReviewedForTests = () => reviewedThisLoad.clear();

export const REVIEWS_PAGE_SIZE = 10;

/** Per customer: the list is theirs alone. */
export const reviewableKey = (customerId: number | null) => ['orders', 'reviewable', customerId] as const;
/** The public list; a submit invalidates it even though a new review waits for approval, so an approved-on-submit shop shows it at once. */
export const REVIEWS_KEY = ['reviews'] as const;

export function useReviews(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: REVIEWS_KEY,
    queryFn: ({ pageParam }) => fetchReviews(pageParam, REVIEWS_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasNextPage ? last.meta.page + 1 : undefined),
    staleTime: 60_000,
    enabled,
  });
}

/** Submits a review, then refreshes everything it changes: the order, the reminder list and the public list. */
export function useSubmitReview(reference: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitReviewBody) => submitReview(reference, body),
    onSuccess: () => refreshAfterReview(client, reference),
  });
}

/** Also what a 409 or "already exists" 422 does: the order now carries the review. */
export function refreshAfterReview(client: ReturnType<typeof useQueryClient>, reference: string) {
  reviewedThisLoad.add(reviewedKey(useSessionStore.getState().customer?.id ?? null, reference));
  void client.invalidateQueries({ queryKey: ['order', reference] });
  void client.invalidateQueries({ queryKey: ['orders', 'reviewable'] });
  void client.invalidateQueries({ queryKey: REVIEWS_KEY });
}
