export interface QuoteItem { productId: number; name: string; sku: string | null; quantity: number; unitPrice: number; lineTotal: number; tierApplied: boolean; isPreorder: boolean }
export interface QuoteCoupon { code: string; discountAmount: number; shippingDiscount: number; autoApplied: boolean }
export interface ShippingOption { id: number; name: string; courier: string | null; price: number; freeShipping: boolean }
export interface CryptoOption { coin: string; network: string; coinLabel: string; networkLabel: string; feeType: string | null; feeValue: number | null; feeRateText: string; feeLabel: string; fee: number; chargeTotal: number }
export interface PaymentMethod {
  slot: 'card' | 'crypto' | 'manual'; method: string; displayName: string; type: 'gateway' | 'crypto' | 'offline';
  details: Record<string, string> | null; feeType: string | null; feeValue: number | null; feeRateText: string; feeLabel: string;
  fee: number; chargeTotal: number; cryptoOptions?: CryptoOption[];
}
export interface Quote {
  items: QuoteItem[]; subtotal: number; coupon: QuoteCoupon | null; shippingOptions: ShippingOption[];
  selectedShippingOptionId: number | null; shippingAmount: number;
  storeCredit: { balance: number; applied: number; remaining: number };
  grandTotal: number; amountDue: number; paymentMethods: PaymentMethod[];
  contactModes: import('./settings.ts').ContactModes;
}
export interface QuoteInput { country?: string; couponCode?: string; shippingOptionId?: number; useStoreCredit?: boolean }
export interface ShippingAddressInput {
  firstName: string; surname: string; addressLine1: string; addressLine2?: string | null; addressLine3?: string | null;
  city: string; county?: string | null; zip: string; country: string;
}
export interface CheckoutInput {
  shippingAddress: ShippingAddressInput; email?: string; phone?: string; shippingOptionId: number; couponCode?: string;
  paymentMethod?: string; coin?: string; network?: string; useStoreCredit?: boolean; notes?: string;
}
export type CheckoutPayment =
  | { type: 'none' }
  | { type: 'checkout_url'; paymentId: number; method: string; amount: number; url: string }
  | { type: 'manual'; paymentId: number; method: string; displayName: string; amount: number; instructions: Record<string, string> }
  | { type: 'crypto'; paymentId: number; method: string; coin: string; network: string; coinLabel: string; networkLabel: string; address: string; coinAmount: string; fiatAmount: number; qrData: string; walletLinks: Array<{ label: string; url: string }> };
export interface CheckoutResult { reference: string; publicUrl: string | null; status: string; total: number; payment: CheckoutPayment; warning?: string }
export interface GuestQuoteInput extends Omit<QuoteInput, 'useStoreCredit'> { turnstileToken: string; items: import('./cart.ts').CartLineInput[] }
export interface GuestCheckoutInput extends Omit<CheckoutInput, 'useStoreCredit'> { turnstileToken: string; items: import('./cart.ts').CartLineInput[] }
