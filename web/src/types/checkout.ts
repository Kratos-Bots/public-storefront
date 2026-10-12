export interface QuoteItem {
  productId: number; name: string; sku: string | null; quantity: number; unitPrice: number; lineTotal: number; tierApplied: boolean; isPreorder: boolean;
  /** Absent on a backend that predates promotions. */
  promotionDiscount?: number; promotions?: import('./cart.ts').PromotionTag[];
}
/** A promotion the quote applied; `freeShipping` with `amount` 0 is a free-shipping deal with no line discount. */
export interface QuotePromotion { id: number; label: string; amount: number; freeShipping: boolean }
export interface QuoteCoupon { code: string; discountAmount: number; shippingDiscount: number; autoApplied: boolean }
export interface ShippingOption { id: number; name: string; courier: string | null; price: number; freeShipping: boolean }
export interface CryptoOption { coin: string; network: string; coinLabel: string; networkLabel: string; feeType: string | null; feeValue: number | null; feeRateText: string; feeLabel: string; fee: number; chargeTotal: number;
  /** Partner scope only: what the shopper is charged, in the partner's currency. Absent in shop scope and on an older backend. */
  chargeCurrency?: string; settlementTotal?: number }
export interface PaymentMethod {
  /** Sent for older builds; not read. */
  slot?: 'card' | 'crypto' | 'manual';
  method: string; displayName: string; type: 'gateway' | 'crypto' | 'offline';
  details: Record<string, string> | null; feeType: string | null; feeValue: number | null; feeRateText: string; feeLabel: string;
  fee: number; chargeTotal: number; cryptoOptions?: CryptoOption[];
  /** Partner scope only: what the shopper is charged, in the partner's currency. */
  chargeCurrency?: string; settlementTotal?: number;
}
export type PaymentMethodsUnavailable = 'partner_unreachable' | 'partner_not_ready' | 'rate_unavailable';
export interface Quote {
  items: QuoteItem[]; subtotal: number; coupon: QuoteCoupon | null; shippingOptions: ShippingOption[];
  selectedShippingOptionId: number | null; shippingAmount: number;
  storeCredit: { balance: number; applied: number; remaining: number };
  grandTotal: number; amountDue: number; paymentMethods: PaymentMethod[];
  /** The partner that takes payment for this warehouse could not be asked: `paymentMethods` is then empty. Absent otherwise. */
  paymentMethodsUnavailable?: PaymentMethodsUnavailable;
  /** `grandTotal` is already net of these; `coupon.discountAmount` stays the coupon's own amount. */
  promotionDiscount?: number; promotions?: QuotePromotion[]; nudge?: import('./cart.ts').Nudge | null;
  contactModes: import('./settings.ts').ContactModes;
}
export interface QuoteInput { /** The shopper's chosen warehouse; the API layer adds it, and only when a non-default one is chosen. */ warehouseId?: number; country?: string; couponCode?: string; shippingOptionId?: number; useStoreCredit?: boolean; deliveryMethod?: 'home' | 'collection'; servicePointCarrier?: string }
export interface ShippingAddressInput {
  firstName: string; surname: string; addressLine1: string; addressLine2?: string | null; addressLine3?: string | null;
  city: string; county?: string | null; zip: string; country: string;
  servicePointId?: string | null; servicePointCarrier?: string | null; servicePointName?: string | null;
}
export interface CheckoutInput {
  /** The shopper's chosen warehouse; the API layer adds it, and only when a non-default one is chosen. */
  warehouseId?: number;
  shippingAddress: ShippingAddressInput; email?: string; phone?: string; shippingOptionId: number; couponCode?: string;
  /** A friend's referral code. Applied after the order is placed; silently ignored if unknown, the shopper's own, or they already have a referrer. */
  referralCode?: string;
  paymentMethod?: string; coin?: string; network?: string; useStoreCredit?: boolean; notes?: string;
}
export type CheckoutPayment =
  | { type: 'none' }
  | { type: 'checkout_url'; paymentId: number; method: string; amount: number; url: string; settlementAmount?: number | null; settlementCurrency?: string | null }
  | { type: 'manual'; paymentId: number; method: string; displayName: string; amount: number; instructions: Record<string, string>; settlementAmount?: number | null; settlementCurrency?: string | null }
  | { type: 'crypto'; paymentId: number; method: string; coin: string; network: string; coinLabel: string; networkLabel: string; address: string; coinAmount: string; fiatAmount: number; qrData: string; walletLinks: Array<{ label: string; url: string }>; settlementAmount?: number | null; settlementCurrency?: string | null }
  /** The payment is being created with a dropship partner; the order's payment view carries `partnerPending` until it exists. */
  | { type: 'partner_pending'; method: string; coin?: string; network?: string };
export interface CheckoutResult {
  reference: string; publicUrl: string | null; status: string; total: number; payment: CheckoutPayment; warning?: string;
  /** Guest checkout only, and only when it created a brand-new customer: a session for them. Older backends omit it. */
  session?: import('./auth.ts').LoginResult;
}
export interface GuestQuoteInput extends Omit<QuoteInput, 'useStoreCredit'> { turnstileToken: string; items: import('./cart.ts').CartLineInput[] }
export interface GuestCheckoutInput extends Omit<CheckoutInput, 'useStoreCredit'> { turnstileToken: string; items: import('./cart.ts').CartLineInput[] }

/**
 * `GET storefront/checkout/last-details`: what the signed-in customer's most recent order (any status, not archived) shipped to.
 * `servicePoint` is set when that order was a collection: the address lines are then the point's, not the shopper's.
 */
export interface LastCheckoutDetails {
  orderReference: string;
  placedAt: string;
  firstName: string;
  surname: string;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  city: string;
  county: string | null;
  zip: string;
  country: string;
  email: string | null;
  phone: string | null;
  servicePoint: { id: string; carrier: string; name: string } | null;
}
