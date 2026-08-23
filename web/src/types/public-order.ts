// Shape of the backend's public order-status payload
// (GET /api/v1/public/orders/:reference/:accessKey). Distinct from the minimal
// `OrderStatus` in checkout.ts, which only carries payment state for success-page polling.

export type PublicOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'partially_shipped'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type ShipmentStatus = 'shipped' | 'in_transit' | 'delivered' | 'returned';

export interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isPreorder: boolean;
}

export interface OrderTotals {
  subtotal: number;
  shippingAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  /** Signed provider adjustment included in totalAmount. Optional: absent from older backends. */
  paymentFeeAmount?: number;
  /** Line label, e.g. 'Crypto discount'. Null when there is no adjustment. */
  paymentFeeLabel?: string | null;
}

export interface ShippingAddress {
  firstName: string;
  surname: string;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  city: string;
  county: string | null;
  zip: string;
  country: string;
}

export interface Shipment {
  status: ShipmentStatus;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingStatusDescription: string | null;
  shippedAt: string | null; // ISO 8601
  deliveredAt: string | null; // ISO 8601
}

export interface PublicCryptoPayment {
  paymentId: number;
  paymentStatus: string | null; // 'pending' | 'completed' | 'cancelled' | 'failed' | ...
  coin: string;
  network: string;
  coinLabel: string; // e.g. 'USDT'
  networkLabel: string; // e.g. 'Polygon'
  address: string; // static deposit address
  coinAmount: string | number; // exact amount to send, already display-rounded
  fiatAmount: number;
  verificationStatus: string; // 'pending' | 'checking' | 'confirmed' | 'needs_review'
  needsAttention: boolean; // true when needs_review
  txidMasked: string | null; // '1a2b3c…d4e5f6' once submitted
}

export type PaymentKind = 'gateway' | 'crypto' | 'other';

export interface ActivePayment {
  paymentId: number;
  method: string; // backend gateway name
  kind: PaymentKind;
  status: string; // 'pending' | 'completed' | 'failed' | 'refunded'
  checkoutUrl: string | null; // gateway payments only
  canChange: boolean; // false once a crypto txid is submitted
}

export interface OrderPaymentState {
  canPay: boolean;
  payBy: string | null; // ISO 8601 auto-cancel deadline
  activePayment: ActivePayment | null;
}

export interface PublicOrder {
  reference: string;
  status: PublicOrderStatus;
  createdAt: string; // ISO 8601
  deliveredAt: string | null; // ISO 8601
  isPreorder: boolean;
  currency: string; // ISO 4217, e.g. "GBP"
  items: OrderItem[];
  totals: OrderTotals;
  shippingAddress: ShippingAddress | null;
  shipments: Shipment[];
  /** Static-crypto payments on this order. Optional: absent from older backends. */
  cryptoPayments?: PublicCryptoPayment[];
  /** Payment state + deadline. Optional: absent from older backends. */
  payment?: OrderPaymentState;
}

export type CryptoTxidVerification = 'confirmed' | 'checking' | 'needs_review';
export interface SelectPaymentResult {
  paymentId: number; method: string; kind: 'gateway' | 'crypto' | 'other'; status: string; checkoutUrl: string | null;
  crypto: { coin: string; network: string; coinLabel: string; networkLabel: string; address: string; coinAmount: string; fiatAmount: number; verificationStatus: string } | null;
}
