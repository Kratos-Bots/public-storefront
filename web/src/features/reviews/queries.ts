import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchReviews, submitReview } from '@/api/reviews.ts';
import type { SubmitReviewBody } from '@/types/reviews.ts';

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
  void client.invalidateQueries({ queryKey: ['order', reference] });
  void client.invalidateQueries({ queryKey: ['orders', 'reviewable'] });
  void client.invalidateQueries({ queryKey: REVIEWS_KEY });
}
