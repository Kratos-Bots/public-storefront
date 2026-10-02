// Built-in fake data for the page builder's "Preview as" (spec §6). This repo is public:
// everything here is invented for "Northbound Supply" on shop.example — never real data.
import type { PreviewAs } from '@/builder/mode.ts';
import type { LocalLine } from '@/stores/cart.ts';
import type { SessionCustomer } from '@/stores/session.ts';
import type { ServerCart } from '@/types/cart.ts';
import type { Product } from '@/types/catalog.ts';
import type { Quote } from '@/types/checkout.ts';
import type { OrderDetail, OrderSummary } from '@/types/orders.ts';
import type { Profile, RedeemOptions } from '@/types/profile.ts';
import type { PublicOrder } from '@/types/public-order.ts';
import type { TrackedParcel, TrackingLookup } from '@/types/tracking.ts';
import type { VerificationResult } from '@/api/verify.ts';

export const FIXTURE_TOKEN = 'sf-builder-fixture-token';
export const FIXTURE_CUSTOMER: SessionCustomer = { id: 900001, nickname: 'Morgan' };
export const FIXTURE_ORDER_REF = 'NB0977';
export const FIXTURE_ACCESS_KEY = 'preview';

/**
 * "Preview with" when the catalogue is empty (spec §11): the product the product page, the sheet
 * and the card designer show. No photo, so nothing is fetched for it.
 */
export const FIXTURE_PRODUCT: Product = {
  id: 900201, sku: 'NB-TO-01', name: 'Northbound Trail Oats 1kg', displayName: 'Northbound Trail Oats 1kg', shortDisplayName: null, shortDescription: null,
  description: 'Rolled jumbo oats, milled slow and packed the same week. A kilo is about twenty trail breakfasts.',
  categoryId: null, categoryName: null, sortOrder: 0, price: 12, inStock: true, lowStockAlert: false, isActive: true,
  isPreorder: false, preorderEta: null, pricingTiers: [{ id: 1, minQuantity: 5, price: 10.5 }], upsellProductIds: [],
  excludedFromFreeShipping: false, imageProductId: null,
  provenance: 'Grown and milled by Northbound Supply partners; packed at shop.example.',
  minOrderQuantity: null, maxOrderQuantity: null,
  promotions: [{ id: 900401, label: '3 for 2 on trail oats' }],
};

export const FIXTURE_CART_LINES: LocalLine[] = [
  {
    productId: 900101, displayName: 'Northbound Field Kit', sku: 'NB-FK-01', unitPrice: 48, basePrice: 48,
    pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
  },
  {
    productId: 900102, displayName: 'Northbound Trail Tin', sku: 'NB-TT-02', unitPrice: 12.5, basePrice: 14,
    pricingTiers: [{ id: 1, minQuantity: 3, price: 12.5 }], quantity: 3, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
  },
];

/** A sample automatic promotion for the editor's cart and checkout previews: one tin free in three. */
const FIXTURE_PROMOTION = { id: 900402, label: '3 for 2 on trail tins' };
const FIXTURE_NUDGE = { promotionId: 900403, label: '5% off orders over £100', kind: 'spend', missing: 27 } as const;

export const FIXTURE_QUOTE: Quote = {
  items: [
    { productId: 900101, name: 'Northbound Field Kit', sku: 'NB-FK-01', quantity: 1, unitPrice: 48, lineTotal: 48, tierApplied: false, isPreorder: false },
    {
      productId: 900102, name: 'Northbound Trail Tin', sku: 'NB-TT-02', quantity: 3, unitPrice: 12.5, lineTotal: 37.5, tierApplied: true, isPreorder: false,
      promotionDiscount: 12.5, promotions: [FIXTURE_PROMOTION],
    },
  ],
  subtotal: 85.5,
  promotionDiscount: 12.5,
  promotions: [{ ...FIXTURE_PROMOTION, amount: 12.5, freeShipping: false }],
  nudge: FIXTURE_NUDGE,
  coupon: null,
  shippingOptions: [
    { id: 1, name: 'Tracked 48', courier: 'Royal Mail', price: 4.95, freeShipping: false },
    { id: 2, name: 'Tracked 24', courier: 'Royal Mail', price: 6.95, freeShipping: false },
  ],
  selectedShippingOptionId: 1,
  shippingAmount: 4.95,
  storeCredit: { balance: 0, applied: 0, remaining: 0 },
  grandTotal: 77.95,
  amountDue: 77.95,
  paymentMethods: [
    { slot: 'card', method: 'card', displayName: 'Card payment', type: 'gateway', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 77.95 },
    { slot: 'manual', method: 'bank_transfer', displayName: 'Bank transfer', type: 'offline', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 77.95 },
  ],
  contactModes: { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: null },
};

export const FIXTURE_ORDERS: OrderSummary[] = [
  { reference: 'NB1042', status: 'pending', createdAt: '2026-09-20T12:30:00.000Z', totalAmount: 90.45, outstandingBalance: 90.45 },
  { reference: FIXTURE_ORDER_REF, status: 'shipped', createdAt: '2026-09-02T10:15:00.000Z', totalAmount: 64.9, outstandingBalance: 0 },
];

export const FIXTURE_ORDER_DETAIL: OrderDetail = {
  reference: FIXTURE_ORDER_REF,
  status: 'shipped',
  createdAt: '2026-09-02T10:15:00.000Z',
  items: [
    { name: 'Northbound Field Kit', quantity: 1, unitPrice: 48, lineTotal: 48 },
    { name: 'Northbound Trail Tin', quantity: 1, unitPrice: 14, lineTotal: 14 },
  ],
  subtotal: 62,
  shippingAmount: 2.9,
  discountAmount: 0,
  totalAmount: 64.9,
  payments: [{ method: 'card', amount: 64.9, status: 'completed', createdAt: '2026-09-02T10:16:00.000Z' }],
  outstandingBalance: 0,
  shipments: [{
    status: 'in_transit', carrier: 'Royal Mail', trackingNumber: 'NB000977GB', trackingUrl: 'https://shop.example/track/NB000977GB',
    trackingStatusDescription: 'In transit', shippedAt: '2026-09-03T08:00:00.000Z', deliveredAt: null,
  }],
  publicUrl: `https://shop.example/order/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}`,
};

export const FIXTURE_PUBLIC_ORDER: PublicOrder = {
  reference: FIXTURE_ORDER_REF,
  status: 'shipped',
  createdAt: '2026-09-02T10:15:00.000Z',
  deliveredAt: null,
  isPreorder: false,
  currency: 'GBP',
  items: [
    { productName: 'Northbound Field Kit', quantity: 1, unitPrice: 48, totalPrice: 48, isPreorder: false },
    { productName: 'Northbound Trail Tin', quantity: 1, unitPrice: 14, totalPrice: 14, isPreorder: false },
  ],
  totals: { subtotal: 62, shippingAmount: 2.9, discountAmount: 0, taxAmount: 0, totalAmount: 64.9 },
  shippingAddress: {
    firstName: 'Morgan', surname: 'Reed', addressLine1: '1 Harbour Row', addressLine2: null, addressLine3: null,
    city: 'Northbound', county: null, zip: 'NB1 0AA', country: 'GB',
  },
  shipments: [{
    status: 'in_transit', carrier: 'Royal Mail', trackingNumber: 'NB000977GB', trackingUrl: 'https://shop.example/track/NB000977GB',
    trackingStatusDescription: 'In transit', shippedAt: '2026-09-03T08:00:00.000Z', deliveredAt: null,
  }],
  payment: { canPay: false, payBy: null, activePayment: null },
};

// ── Stage 5 previews: the order-status page's states (spec section 11.3) ────────

type OrderStateId = 'shipped' | 'awaiting-payment' | 'hosted-open' | 'crypto-checking' | 'two-parcels' | 'cancelled';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** The order page's preview states; an unpaid order's pay-by date is `now` + 3 days, so it never reads as past. */
export function fixtureOrderStates(now: Date): Record<OrderStateId, PublicOrder> {
  const FIXTURE_PAY_BY = new Date(now.getTime() + THREE_DAYS_MS).toISOString();
  const FIXTURE_AWAITING: PublicOrder = {
    ...FIXTURE_PUBLIC_ORDER,
    status: 'pending',
    shipments: [],
    payment: { canPay: true, payBy: FIXTURE_PAY_BY, activePayment: null },
  };
  return {
  shipped: FIXTURE_PUBLIC_ORDER,
  'awaiting-payment': FIXTURE_AWAITING,
  'hosted-open': {
    ...FIXTURE_AWAITING,
    payment: {
      canPay: true, payBy: FIXTURE_PAY_BY,
      activePayment: {
        paymentId: 900301, method: 'card', kind: 'gateway', status: 'pending',
        checkoutUrl: `https://shop.example/pay/${FIXTURE_ORDER_REF}`, canChange: true, settlementAmount: null, settlementCurrency: null,
      },
    },
  },
  'crypto-checking': {
    ...FIXTURE_AWAITING,
    cryptoPayments: [{
      paymentId: 900302, paymentStatus: 'pending', coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon',
      address: '0xNB0977000000000000000000000000000000EXAMPLE', coinAmount: '64.90', fiatAmount: 64.9,
      verificationStatus: 'checking', needsAttention: false, txidMasked: '1a2b3c…d4e5f6',
    }],
    payment: {
      canPay: true, payBy: FIXTURE_PAY_BY,
      activePayment: { paymentId: 900302, method: 'crypto', kind: 'crypto', status: 'pending', checkoutUrl: null, canChange: false },
    },
  },
  'two-parcels': {
    ...FIXTURE_PUBLIC_ORDER,
    shipments: [
      ...FIXTURE_PUBLIC_ORDER.shipments,
      {
        status: 'delivered', carrier: 'Royal Mail', trackingNumber: 'NB000978GB', trackingUrl: 'https://shop.example/track/NB000978GB',
        trackingStatusDescription: 'Delivered', shippedAt: '2026-09-03T08:00:00.000Z', deliveredAt: '2026-09-05T12:30:00.000Z',
      },
    ],
  },
  cancelled: { ...FIXTURE_PUBLIC_ORDER, status: 'cancelled', shipments: [], payment: { canPay: false, payBy: null, activePayment: null } },
  };
}

export const FIXTURE_REDEEM: RedeemOptions = {
  loyaltyPoints: 860,
  options: [
    { id: 1, label: '5.00 off', pointsCost: 500, creditValue: 5, affordable: true },
    { id: 2, label: '25.00 off', pointsCost: 2000, creditValue: 25, affordable: false },
  ],
};

export function fixtureProfile(p: PreviewAs): Profile {
  const orders = p.session === 'signed-in-orders';
  return {
    loyaltyPoints: 860, storeCreditBalance: 5, referralCode: 'NB-MORGAN-2041', referralsCount: 2, referredPeopleCount: 1,
    hasReferrer: false, referrerNickname: null, totalOrders: orders ? 2 : 0, totalSpend: orders ? 155.35 : 0,
    memberSince: '2026-03-02T09:00:00.000Z', nickname: 'Morgan', identities: { telegram: false, whatsapp: true, email: true },
  };
}

export function fixtureServerCart(p: PreviewAs): ServerCart {
  const lines = p.cart === 'items' ? FIXTURE_CART_LINES : [];
  const items = lines.map((l) => ({
    productId: l.productId, name: l.displayName, quantity: l.quantity, unitPrice: l.unitPrice,
    lineTotal: Math.round(l.unitPrice * l.quantity * 100) / 100, imageUrl: null, isPreorder: l.isPreorder,
    outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false,
    minOrderQuantity: null, maxOrderQuantity: null,
    // The trail tins carry the sample promotion: one of the three is free.
    ...(l.productId === 900102 ? { promotionDiscount: 12.5, promotions: [FIXTURE_PROMOTION] } : { promotionDiscount: 0, promotions: [] }),
  }));
  const subtotal = Math.round(items.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100;
  const promotionDiscount = Math.round(items.reduce((sum, i) => sum + (i.promotionDiscount ?? 0), 0) * 100) / 100;
  return {
    items,
    subtotal,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    promotionDiscount,
    promotions: promotionDiscount > 0 ? [{ ...FIXTURE_PROMOTION, amount: promotionDiscount }] : [],
    total: Math.round((subtotal - promotionDiscount) * 100) / 100,
    nudge: items.length > 0 ? FIXTURE_NUDGE : null,
  };
}

// ── Stage 4 previews: tracking, verification, payment chat links ───────────────

const parcel = (trackingNumber: string, status: string, shipmentStatus: 'shipped' | 'in_transit' | 'delivered', n: number): TrackedParcel => ({
  trackingNumber,
  shipmentStatus,
  shippedAt: '2026-09-03T08:00:00.000Z',
  deliveredAt: shipmentStatus === 'delivered' ? '2026-09-05T14:20:00.000Z' : null,
  fallbackDescription: null,
  tracking: {
    outcome: 'ok',
    status,
    courierNumber: trackingNumber,
    destination: { code: 'GB', name: 'United Kingdom' },
    lastEventAt: '2026-09-04T09:40:00.000Z',
    deliveredAt: shipmentStatus === 'delivered' ? '2026-09-05T14:20:00.000Z' : null,
    events: [
      { occurredAt: '2026-09-04T09:40:00.000Z', place: 'Northbound Sorting Centre', code: 'IT', text: 'Arrived at the sorting centre' },
      { occurredAt: '2026-09-03T17:05:00.000Z', place: 'Northbound Depot', code: 'PT', text: `Parcel ${n} collected from the sender` },
    ],
    lastMile: { name: 'Royal Mail', url: 'https://shop.example/track/last-mile' },
    lastMileNumber: trackingNumber,
    checkedAt: '2026-09-04T10:00:00.000Z',
    errorCode: null,
  },
});

const trackingOrder = (parcels: TrackedParcel[]): TrackingLookup => ({
  reference: FIXTURE_ORDER_REF,
  status: parcels.length > 0 ? 'shipped' : 'confirmed',
  createdAt: '2026-09-02T10:15:00.000Z',
  itemCount: 3,
  isPreorder: false,
  parcels,
  trackingAvailable: true,
  checkedAt: '2026-09-04T10:00:00.000Z',
});

/** The order-tracking answers the tracking preview states draw (no lookup, no challenge). */
export const FIXTURE_TRACKING: { twoParcels: TrackingLookup; oneParcel: TrackingLookup; nothingShipped: TrackingLookup } = {
  twoParcels: trackingOrder([parcel('NB000977GB', 'IN_TRANSIT', 'in_transit', 1), parcel('NB000978GB', 'PRE_TRANSIT', 'shipped', 2)]),
  oneParcel: trackingOrder([parcel('NB000977GB', 'IN_TRANSIT', 'in_transit', 1)]),
  nothingShipped: trackingOrder([]),
};

/**
 * The record behind the verification previews. Verified cards derive "expired" from the date
 * against today, so the dates are built relative to `now`: authentic is in date, expired is not.
 */
export function fixtureVerification(now: Date = new Date()): { authentic: VerificationResult; expired: VerificationResult; notVerified: null } {
  const shift = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
  return {
    authentic: { createdAt: shift(-120), expiryDate: shift(600) },
    expired: { createdAt: shift(-900), expiryDate: shift(-30) },
    notVerified: null,
  };
}

/** Invented chat links for the "Order placed" preview (placeholders on shop.example's brand). */
export const FIXTURE_CHAT_LINKS = {
  whatsapp: 'https://wa.me/440000000000?text=Hi%2C%20my%20order%20is%20NB0977',
  telegram: 'https://t.me/northbound_supply_example?text=Hi%2C%20my%20order%20is%20NB0977',
} as const;
