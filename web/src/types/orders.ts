export interface OrderSummary { reference: string; status: string; createdAt: string; totalAmount: number; outstandingBalance: number }
export interface OrderShipment { status: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; trackingStatusDescription: string | null; shippedAt: string | null; deliveredAt: string | null }
export interface OrderDetail {
  reference: string; status: string; createdAt: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number; shippingAmount: number; discountAmount: number; totalAmount: number;
  payments: Array<{ method: string; amount: number; status: string; createdAt: string }>;
  outstandingBalance: number; shipments: OrderShipment[]; publicUrl: string | null;
}
export interface PageMeta { page: number; limit: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean }
