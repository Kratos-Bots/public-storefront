
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** The shop's review switch, from `GET storefront/settings`. Absent on an older backend: reviews are off. */
export interface ReviewSettings { enabled: boolean; maxLength: number }

/** A review as the order page shows it: the shopper's own, whatever its status. */
export interface OrderReviewRecord { rating: number; comment: string | null; status: ReviewStatus; createdAt: string }

/** `review` on `GET storefront/orders/:reference`. Absent on an older backend: nothing to show. */
export interface OrderReviewState { canReview: boolean; existing: OrderReviewRecord | null }

export interface SubmitReviewBody { rating: number; comment?: string }

/** One entry of `GET storefront/orders/reviewable`. */
export interface ReviewableOrder { reference: string; eligibleSince: string; remindUntil: string }

/** An approved review on the public page: anonymous. */
export interface PublicReview { id: number; rating: number; comment: string | null; createdAt: string }
export interface ReviewsPageData { stats: { average: number | null; count: number }; reviews: PublicReview[] }
