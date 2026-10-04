export interface OrderSummary { reference: string; status: string; createdAt: string; totalAmount: number; outstandingBalance: number }
export interface OrderShipment { status: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; trackingStatusDescription: string | null; shippedAt: string | null; deliveredAt: string | null }
export interface OrderDetail {
  reference: string; status: string; createdAt: string;
  servicePoint?: { name: string; carrier: string } | null;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number; promotionDiscount?: number }>;
  /** `discountAmount` INCLUDES `promotionDiscount`; the coupon/other part is the difference. */
  subtotal: number; shippingAmount: number; discountAmount: number; totalAmount: number;
  promotionDiscount?: number; promotions?: OrderPromotion[];
  payments: Array<{ method: string; methodLabel?: string; amount: number; status: string; createdAt: string }>;
  outstandingBalance: number; shipments: OrderShipment[]; publicUrl: string | null;
  accessKey?: string | null; canCancel?: boolean; cancelBlockedBy?: import('./public-order.ts').CancelBlockedBy | null;
}

/** An order the customer can still pay, as `GET storefront/orders/unpaid` returns it. */
export interface UnpaidOrder {
  reference: string; accessKey: string | null; createdAt: string; totalAmount: number; outstandingBalance: number;
  payBy: string | null; canCancel: boolean; cancelBlockedBy: import('./public-order.ts').CancelBlockedBy | null;
}
export interface PageMeta { page: number; limit: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean }
export interface OrderPromotion { label: string; amount: number }
