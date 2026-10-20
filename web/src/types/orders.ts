import type { OrderReviewState } from '@/types/reviews.ts';
import type { CancelBlockedBy, ShippingAddress } from '@/types/public-order.ts';

/** `currency` is the order's own. An older backend omits it; read a missing one as the shop currency. */
export interface OrderSummary { reference: string; status: string; createdAt: string; totalAmount: number; outstandingBalance: number; currency?: string }
export interface OrderShipment { status: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; trackingStatusDescription: string | null; shippedAt: string | null; deliveredAt: string | null }
export interface OrderDetail {
  reference: string; status: string; createdAt: string;
  /** The currency every amount on this order is in (the one it was placed in). Absent on an older backend - read as the shop currency. */
  currency?: string;
  servicePoint?: { name: string; carrier: string } | null;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number; promotionDiscount?: number }>;
  /** `discountAmount` INCLUDES `promotionDiscount`; the coupon/other part is the difference. */
  subtotal: number; shippingAmount: number; discountAmount: number; totalAmount: number;
  promotionDiscount?: number; promotions?: OrderPromotion[];
  payments: Array<{ method: string; methodLabel?: string; amount: number; status: string; createdAt: string }>;
  outstandingBalance: number; shipments: OrderShipment[];
  canCancel?: boolean; cancelBlockedBy?: CancelBlockedBy | null;
  shippingAddress?: ShippingAddress | null;
  /** Absent on backends older than storefront reviews. */
  review?: OrderReviewState;
}

/** An order the customer can still pay, as `GET storefront/orders/unpaid` returns it. */
export interface UnpaidOrder {
  reference: string; createdAt: string; totalAmount: number; outstandingBalance: number; currency?: string;
  payBy: string | null; canCancel: boolean; cancelBlockedBy: CancelBlockedBy | null;
}
export interface PageMeta { page: number; limit: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean }
export interface OrderPromotion { label: string; amount: number }
