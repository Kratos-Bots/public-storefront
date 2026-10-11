import { api, unwrap, unwrapWithMeta } from '@/api/client.ts';
import type { PageMeta } from '@/types/orders.ts';
import type { OrderReviewRecord, ReviewableOrder, ReviewsPageData, SubmitReviewBody } from '@/types/reviews.ts';

/** Review the signed-in customer's own delivered order (one review per order). */
export const submitReview = (reference: string, body: SubmitReviewBody) =>
  unwrap<{ review: OrderReviewRecord }>(api.post(`storefront/orders/${encodeURIComponent(reference)}/review`, { json: body, retry: 0 }));

/** Orders the customer may review now and has not (newest first, at most five). */
export const fetchReviewableOrders = () =>
  unwrap<{ orders: ReviewableOrder[] }>(api.get('storefront/orders/reviewable', { retry: 0 }));

/** Approved reviews, anonymous, newest first. */
export const fetchReviews = (page: number, limit: number) =>
  unwrapWithMeta<ReviewsPageData, PageMeta>(api.get('storefront/reviews', { searchParams: { page, limit } }));
