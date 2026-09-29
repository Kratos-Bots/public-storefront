// Built-in fake data for the page builder's "Preview as" (spec §6). This repo is public:
// everything here is invented for "Northbound Supply" on shop.example — never real data.
import type { PreviewAs } from '@/builder/mode.ts';
import type { LocalLine } from '@/stores/cart.ts';
import type { SessionCustomer } from '@/stores/session.ts';
import type { ServerCart } from '@/types/cart.ts';
import type { Quote } from '@/types/checkout.ts';
import type { OrderDetail, OrderSummary } from '@/types/orders.ts';
import type { Profile, RedeemOptions } from '@/types/profile.ts';
import type { PublicOrder } from '@/types/public-order.ts';

export const FIXTURE_TOKEN = 'sf-builder-fixture-token';
export const FIXTURE_CUSTOMER: SessionCustomer = { id: 900001, nickname: 'Morgan' };
export const FIXTURE_ORDER_REF = 'NB0977';
export const FIXTURE_ACCESS_KEY = 'preview';

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

export const FIXTURE_QUOTE: Quote = {
  items: [
    { productId: 900101, name: 'Northbound Field Kit', sku: 'NB-FK-01', quantity: 1, unitPrice: 48, lineTotal: 48, tierApplied: false, isPreorder: false },
    { productId: 900102, name: 'Northbound Trail Tin', sku: 'NB-TT-02', quantity: 3, unitPrice: 12.5, lineTotal: 37.5, tierApplied: true, isPreorder: false },
  ],
  subtotal: 85.5,
  coupon: null,
  shippingOptions: [
    { id: 1, name: 'Tracked 48', courier: 'Royal Mail', price: 4.95, freeShipping: false },
    { id: 2, name: 'Tracked 24', courier: 'Royal Mail', price: 6.95, freeShipping: false },
  ],
  selectedShippingOptionId: 1,
  shippingAmount: 4.95,
  storeCredit: { balance: 0, applied: 0, remaining: 0 },
  grandTotal: 90.45,
  amountDue: 90.45,
  paymentMethods: [
    { slot: 'card', method: 'card', displayName: 'Card payment', type: 'gateway', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 90.45 },
    { slot: 'manual', method: 'bank_transfer', displayName: 'Bank transfer', type: 'offline', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 90.45 },
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
  }));
  return {
    items,
    subtotal: Math.round(items.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}
