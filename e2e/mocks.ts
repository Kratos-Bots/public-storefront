import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';
import type { Catalog, Product } from '../web/src/types/catalog.ts';
import type { CheckoutPayment, CheckoutResult, PaymentMethod, Quote } from '../web/src/types/checkout.ts';
import type { ServerCart, ServerCartLine, CartLineInput } from '../web/src/types/cart.ts';
import type { OrderDetail, OrderSummary, PageMeta, UnpaidOrder } from '../web/src/types/orders.ts';
import type { Profile, RedeemOptions } from '../web/src/types/profile.ts';
import type { PublicOrder, SelectPaymentResult, Shipment } from '../web/src/types/public-order.ts';
import type { ServicePoint } from '../web/src/types/service-points.ts';
import type { StorefrontSettings } from '../web/src/types/settings.ts';
import type { TrackingLookup } from '../web/src/types/tracking.ts';
import type { LoginResult, ResetCheck, WhatsappStart } from '../web/src/types/auth.ts';
import type { ProfilePassword } from '../web/src/types/profile.ts';
import type { PageSet } from '../web/src/builder/types.ts';

/** The dev server the suite starts (see playwright.config.ts). Route globs are
 *  anchored to it: a bare `**\/api\/**` also matches Vite's own module URLs
 *  (`/src/api/cart.ts`) and kills the boot. */
export const ORIGIN = 'http://localhost:5199';

export const ORDER_REF = 'E2E1';
export const ORDER_KEY = 'KEY1';

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(fileUrl(`./fixtures/${name}`), 'utf8')) as T;

function fileUrl(relative: string): URL {
  return new URL(relative, import.meta.url);
}

interface ProfileFixture {
  profile: Profile;
  redeemOptions: RedeemOptions;
  orders: OrderSummary[];
  orderDetail: OrderDetail;
}

interface TrackingFixture {
  lookup: TrackingLookup;
  verification: { createdAt: string; expiryDate: string };
}

const TURNSTILE_SHIM = readFileSync(fileUrl('./turnstile-shim.js'), 'utf8');

/** 1×1 fully transparent PNG: every `<img>` loads cleanly (no broken-image
 *  branch) and the well's own plate shows through, which is what a catalogue
 *  with no photo on file looks like. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
  'base64',
);

export type Layout = 'storefront' | 'menu' | 'webapp';

/**
 * Public-order variants, selectable per test (`installMocks(page, { order: publicOrderVariant(...) })`).
 * - `crypto`:   awaiting payment, a USDT payment open with its address and txid form (the default fixture)
 * - `choose`:   awaiting payment, no method chosen yet — the picker shows
 * - `shipped`:  paid and on its way — one parcel, nothing owed
 * - `paid`:     paid, nothing shipped yet, nothing owed (every payment and tracking part is silent)
 * - `legacy`:   an older backend's body — no `payment` block, no `cryptoPayments`
 * - `collection`: paid, going to a collection point (`shippingAddress.servicePoint`: Corner News, Evri)
 */
export type OrderVariant = 'crypto' | 'choose' | 'shipped' | 'paid' | 'legacy' | 'collection';

export function publicOrderVariant(kind: OrderVariant): PublicOrder {
  const o = read<PublicOrder>('public-order.json');
  const owed = { canPay: false, payBy: null, activePayment: { paymentId: 9001, method: 'crypto_static', kind: 'crypto' as const, status: 'completed', checkoutUrl: null, canChange: false } };
  switch (kind) {
    case 'crypto':
      return o;
    case 'choose':
      return { ...o, cryptoPayments: [], payment: { canPay: true, payBy: o.payment!.payBy, activePayment: null } };
    case 'paid':
      return { ...o, status: 'confirmed', cryptoPayments: [], payment: owed };
    case 'shipped':
      return {
        ...o, status: 'shipped', cryptoPayments: [], payment: owed,
        shipments: [{ status: 'shipped', carrier: 'Royal Mail', trackingNumber: 'NB000977GB', trackingUrl: 'https://track.example.invalid/NB000977GB', trackingStatusDescription: 'Handed to the courier', shippedAt: '2026-08-25T09:00:00.000Z', deliveredAt: null }],
      };
    case 'collection':
      return { ...o, status: 'confirmed', cryptoPayments: [], payment: owed, shippingAddress: { ...o.shippingAddress!, servicePoint: { name: 'Corner News', carrier: 'evri' } } };
    case 'legacy': {
      const { payment: _payment, cryptoPayments: _crypto, ...rest } = o;
      return rest;
    }
  }
}

/**
 * Named orders for the account order page, selectable per test (`installMocks(page, { orderFixture: 'hosted' })`).
 * Each is the order as the customer's session sees it: `detail` is `GET storefront/orders/:ref`, `payment` is
 * `GET storefront/orders/:ref/payment`, and the two agree on status, money and what can still be cancelled.
 * - `unpaid`:     awaiting payment, no method chosen yet: the picker shows
 * - `hosted`:     awaiting payment, a hosted checkout already open (Open secure checkout)
 * - `crypto`:     awaiting payment, a USDT payment open with its address and txid form
 * - `shipped`:    paid and on its way in two parcels, with a delivery address
 * - `collection`: paid, going to a collection point (Corner News, Evri)
 * - `cancelled`:  cancelled, nothing owed
 */
export type OrderFixtureName = 'unpaid' | 'hosted' | 'crypto' | 'shipped' | 'collection' | 'cancelled';

export interface OrderFixture { detail: OrderDetail; payment: PublicOrder }

const ORDER_TOTAL = 46.03;

export function orderFixture(name: OrderFixtureName, reference: string = ORDER_REF): OrderFixture {
  const base = publicOrderVariant('crypto');
  const address = base.shippingAddress!;
  const detail: OrderDetail = {
    reference,
    status: 'pending',
    createdAt: '2026-08-24T09:05:00.000Z',
    items: [{ name: 'Alpine Extract 10ml', quantity: 1, unitPrice: 42.5, lineTotal: 42.5 }],
    subtotal: 42.5, shippingAmount: 4.95, discountAmount: 0, totalAmount: ORDER_TOTAL,
    payments: [],
    outstandingBalance: ORDER_TOTAL,
    shipments: [],
    canCancel: true,
    cancelBlockedBy: null,
    shippingAddress: address,
  };
  const paidPayment = { method: 'crypto_static', methodLabel: 'Pay with crypto', amount: ORDER_TOTAL, status: 'completed', createdAt: '2026-08-24T09:10:00.000Z' };
  const parcels: Shipment[] = [
    { status: 'shipped', carrier: 'Royal Mail', trackingNumber: 'NB000977GB', trackingUrl: 'https://track.example.invalid/NB000977GB', trackingStatusDescription: 'Handed to the courier', shippedAt: '2026-08-25T09:00:00.000Z', deliveredAt: null },
    { status: 'delivered', carrier: 'Evri', trackingNumber: 'EV123456789', trackingUrl: 'https://track.example.invalid/EV123456789', trackingStatusDescription: 'Delivered', shippedAt: '2026-08-25T09:30:00.000Z', deliveredAt: '2026-08-26T11:12:00.000Z' },
  ];
  // The payment view of an order nothing more can be paid on.
  const settled = (status: PublicOrder['status'], over: Partial<PublicOrder> = {}): PublicOrder => ({
    ...publicOrderVariant('paid'), status, payment: { canPay: false, canCancel: false, cancelBlockedBy: 'paid', payBy: null, activePayment: null }, ...over,
  });
  const withCancel = (o: PublicOrder): PublicOrder => ({ ...o, payment: { ...o.payment!, canCancel: true, cancelBlockedBy: null } });
  switch (name) {
    case 'unpaid':
      return { detail, payment: { ...withCancel(publicOrderVariant('choose')), reference } };
    case 'hosted': {
      const payment = withCancel(publicOrderVariant('choose'));
      payment.payment!.activePayment = { paymentId: 9003, method: 'sushipp', kind: 'gateway', status: 'pending', checkoutUrl: `https://pay.example.invalid/checkout/${reference}`, canChange: true };
      detail.payments = [{ method: 'sushipp', methodLabel: 'Card payment', amount: ORDER_TOTAL, status: 'pending', createdAt: '2026-08-24T09:10:00.000Z' }];
      return { detail, payment: { ...payment, reference } };
    }
    case 'crypto':
      detail.payments = [{ method: 'crypto_static', methodLabel: 'Pay with crypto', amount: ORDER_TOTAL, status: 'pending', createdAt: '2026-08-24T09:10:00.000Z' }];
      return { detail, payment: { ...withCancel(base), reference } };
    case 'shipped':
      return {
        detail: { ...detail, status: 'shipped', payments: [paidPayment], shipments: parcels, outstandingBalance: 0, canCancel: false, cancelBlockedBy: 'paid' },
        payment: settled('shipped', { reference, shipments: parcels }),
      };
    case 'collection': {
      const point = { name: 'Corner News', carrier: 'evri' };
      return {
        detail: { ...detail, status: 'confirmed', payments: [paidPayment], outstandingBalance: 0, canCancel: false, cancelBlockedBy: 'paid', servicePoint: point, shippingAddress: { ...address, servicePoint: point } },
        payment: settled('confirmed', { reference, shippingAddress: { ...address, servicePoint: point } }),
      };
    }
    case 'cancelled':
      return {
        detail: { ...detail, status: 'cancelled', outstandingBalance: 0, canCancel: false, cancelBlockedBy: null },
        payment: settled('cancelled', { reference, payment: { canPay: false, canCancel: false, cancelBlockedBy: null, payBy: null, activePayment: null } }),
      };
  }
}

/** What the stub hands the app as `Telegram.WebApp.initData`, verbatim. */
export const TELEGRAM_INIT_DATA =
  'query_id=AAE&user=%7B%22id%22%3A777000111%2C%22first_name%22%3A%22Ada%22%7D&auth_date=1790000000&hash=' + 'a'.repeat(64);

const TELEGRAM_STUB = readFileSync(fileUrl('./telegram-stub.js'), 'utf8');

/** Makes the page a Telegram Mini App launch. Call before navigating. */
export async function installTelegramStub(page: Page): Promise<void> {
  await page.addInitScript(`window.__TG_INIT_DATA__ = ${JSON.stringify(TELEGRAM_INIT_DATA)};`);
  await page.addInitScript(TELEGRAM_STUB);
}

/** Four methods under the shop's own names, in the admin's list order, as the backend answers them: crypto first, a card gateway, a fee-bearing wallet, an offline bank transfer. Totals match the default quote's amount due. */
export const FOUR_METHODS: PaymentMethod[] = [
  { method: 'crypto', displayName: 'Pay with crypto', type: 'crypto', details: null, feeType: 'percent', feeValue: -3, feeRateText: '\u22123%', feeLabel: 'Pay with crypto discount', fee: -1.42, chargeTotal: 46.03,
    cryptoOptions: [
      { coin: 'btc', network: 'bitcoin', coinLabel: 'BTC', networkLabel: 'Bitcoin', feeType: 'percent', feeValue: -3, feeRateText: '\u22123%', feeLabel: 'Pay with crypto discount', fee: -1.42, chargeTotal: 46.03 },
      { coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon', feeType: 'percent', feeValue: -3, feeRateText: '\u22123%', feeLabel: 'Pay with crypto discount', fee: -1.42, chargeTotal: 46.03 },
    ] },
  { method: 'stripe', displayName: 'Pay by card', type: 'gateway', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 47.45 },
  { method: 'paypal', displayName: 'PayPal balance', type: 'gateway', details: null, feeType: 'percent', feeValue: 2, feeRateText: '+2%', feeLabel: 'PayPal balance fee', fee: 0.95, chargeTotal: 48.4 },
  { method: 'uk_bank_transfer', displayName: 'Bank transfer (UK)', type: 'offline', details: { 'Account Name': 'Example Shop Ltd', 'Sort Code': '00-00-00', 'Account Number': '00000000' }, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 47.45 },
];

export interface InstallMocksOptions {
  /** Which settings fixture to serve. Ignored when `settings` is given outright. */
  layout?: Layout;
  settings?: StorefrontSettings;
  catalog?: Catalog;
  quote?: Quote;
  /**
   * The payment methods, exactly as given and in that order: the quote answers (signed in and guest) and the
   * order page's `payment-options` all return this list, and the account order's payments gain `methodLabel`
   * from the matching entry's `displayName`. Omitted (the default): every answer is the fixture's, untouched.
   */
  paymentMethods?: PaymentMethod[];
  /** The order's `payment-method` route answers 422 "That payment method is not available for this order". */
  refuseMethodSelection?: boolean;
  /** The order's `payment-method` route answers 409: another payment got there first (the page refetches and shows what is current). */
  conflictMethodSelection?: boolean;
  /** Every pay route (`payment`, `payment-options`, `payment-method`, `crypto-txid`) answers 404 "Order not found", as for an order that has gone. */
  payRoutesGone?: boolean;
  order?: PublicOrder;
  profile?: Profile;
  /** Seed `sf-session-v1` so the app boots signed in. */
  session?: boolean;
  /** Mutate the settings fixture before it is served (flags, theme, kill switch). */
  tweakSettings?: (settings: StorefrontSettings) => void;
  /** Switch email/phone + password sign-in on (`login.password.available`); an object also sets the reset routes. */
  passwordLogin?: boolean | { resetByEmail?: boolean; resetByWhatsapp?: boolean; /** Sign-in answers 429, as for a throttled identifier. */ throttled?: boolean };
  /**
   * Sign in by code. Setting this adds `login.phone` and `login.email` (omit it for an older backend). The mock
   * accepts the code 123456 as `{ status: 'signed_in', ... }` and answers any other with a 200 `{ status: 'incorrect', attemptsRemaining }` (3, then 2, 1, 0). The
   * password account (PASSWORD_ACCOUNT.email) answers `{ next: 'password' }`; every other identity is new.
   */
  codeLogin?: {
    phone?: 'verify' | 'whatsapp' | 'off';
    email?: 'verify' | 'email' | 'off';
    /** Channels the number's country plan lacks: sending on one answers 400 CODE_CHANNEL_UNAVAILABLE. */
    unavailableChannels?: Array<'whatsapp' | 'sms'>;
    /** Every send answers 503 CODE_SERVICE_UNAVAILABLE. */
    down?: boolean;
    /** Verifying answers 400 CODE_EXPIRED. */
    expired?: boolean;
    /** Verifying answers 400 CODE_TOO_MANY_TRIES (the attempt is gone) or 429 CODE_RATE_LIMITED (wait). */
    verifyError?: 'tooManyTries' | 'rateLimited';
    /** The shop's serviceable countries, served as `login.phone.countries` (default: none). */
    countries?: string[];
  };
  /** Mutate the profile fixture before it is served (identities, password block). */
  tweakProfile?: (profile: Profile) => void;
  /** Mutate the account order detail (`GET storefront/orders/:ref`) before it is served. */
  tweakOrderDetail?: (detail: OrderDetail) => void;
  /**
   * Serve this named order (see `orderFixture`) as the account order and its payment view, under `orderReference`
   * (default E2E1). Overrides the profile fixture's delivered K4M2QP order; `tweakOrderDetail` / `tweakOrder` then apply.
   */
  orderFixture?: OrderFixtureName;
  orderReference?: string;
  /** Mutate the payment view (`GET storefront/orders/:ref/payment`) before it is served. */
  tweakOrder?: (order: PublicOrder) => void;
  /** `GET storefront/orders/unpaid` answers these (a signed-in customer only; at most five), minus any order already cancelled. Default: none. */
  unpaidOrders?: UnpaidOrder[];
  /** What both cancel routes answer. `'ok'` (default) cancels; a number answers that status with 409 `ORDER_NOT_CANCELLABLE:bank_transfer` (any other status answers a plain error) and marks the order as blocked. */
  cancelAnswers?: number | 'ok';
  /** What `GET storefront/service-points` answers with a postcode (default: three synthetic GB points). A number answers with that HTTP status instead. */
  servicePoints?: ServicePoint[] | number;
  /** What the checkout routes answer with as `payment` (default: a crypto address). */
  checkoutPayment?: CheckoutPayment;
  /** The reference the checkout routes answer with (default `E2E1`). */
  checkoutReference?: string;
  /** The Mini App sign-in answers 401, as it does for stale or forged initData. */
  telegramAuthFails?: boolean;
  /**
   * Telegram sign-in over OpenID Connect (`login.telegram.oidc: true`). `start` answers Telegram's https URL, which the
   * mock redirects straight back to the callback with a code and state, standing in for the trip to Telegram;
   * `completeFails` makes `complete` answer that status and error code instead of a session.
   */
  telegramOidc?: boolean | { completeFails?: { status: number; error: string } };
  /** Published page set per layout (`GET storefront/pages/:layout`). Omitted = `null` = no published set. */
  pages?: Partial<Record<Layout, PageSet | null>>;
  /** Make the pages route fail (503 or 404) so specs can exercise the built-in fallback. */
  pagesFail?: 503 | 404;
  /** Published site text served alongside the page set. Omitted = today's body
   *  exactly (`null`, or `{ version: 1, data: set }`) with no `text` field. */
  text?: MockText;
  /** Serve the text-era body with `text: null` (nothing published yet) instead of a text object. */
  textNull?: boolean;
  /** Shop access. `denied` answers ACCESS_DENIED on catalogue, cart and checkout for the seeded session. */
  access?: { storefront?: 'public' | 'login' | 'restricted'; registration?: boolean; deniedMessage?: string;
    deniedButtons?: { label: string; url: string }[]; denied?: boolean };
}

/** The published site text the pages route serves (spec §4.6), active locale only. */
export interface MockText {
  version?: number;                 // default 1
  locale?: string;                  // default 'en'
  formatLocale?: string;            // default ''
  shared?: Record<string, unknown>; // active-locale shared strings
  layout?: Partial<Record<Layout, Record<string, unknown>>>; // per-layout overrides
}

export interface MockState {
  settings: StorefrontSettings;
  catalog: Catalog;
  quote: Quote;
  order: PublicOrder;
  profile: Profile;
  redeemOptions: RedeemOptions;
  orders: OrderSummary[];
  orderDetail: OrderDetail;
  tracking: TrackingLookup;
  verification: { createdAt: string; expiryDate: string };
  cart: ServerCart;
  /** Kill switch: everything but the order routes answers 503 STOREFRONT_DISABLED. */
  disabled: boolean;
  /** How many times the login attempt has been polled — pending ×2, then completed. */
  attemptPolls: number;
  /** Every API path the page has asked for, in order. */
  requests: string[];
  /** Bodies posted to the checkout routes, for assertions. */
  checkouts: Array<Record<string, unknown>>;
  /** Bodies posted to the guest quote route, for assertions. */
  guestQuotes: Array<Record<string, unknown>>;
  /** Bodies posted to the signed-in quote route, for assertions. */
  quotes: Array<Record<string, unknown>>;
  /** The country and postcode of every collection-point search, in order. */
  servicePointSearches: Array<{ country: string | null; postalCode: string }>;
  /** Bodies posted to the order's payment-method route (a method / coin / network selection). */
  methods: Array<Record<string, unknown>>;
  /** Bodies posted to the crypto-txid route, for assertions. */
  txids: Array<Record<string, unknown>>;
  /** Bodies posted to the Mini App sign-in route. */
  webappLogins: Array<Record<string, unknown>>;
  /** Bodies posted to Telegram OpenID Connect `start` / `complete`, in order. */
  oidcCalls: Array<{ route: 'start' | 'complete'; body: Record<string, unknown> }>;
  /** Bodies posted to the classic-bot switch. */
  botModes: Array<Record<string, unknown>>;
  /** Every password / account-password / email-verification request, with its body and Authorization header. */
  passwordCalls: Array<{ route: string; body: Record<string, unknown>; authorization: string | null }>;
  /** Bodies posted to the sign-in-by-code routes, keyed by the route after auth/code/. */
  codeCalls: Array<{ route: string; body: Record<string, unknown> }>;
  /** What `GET storefront/pages/:layout` serves. */
  pages: Partial<Record<Layout, PageSet | null>>;
  /** When set, the pages route answers this error status instead of the fixture. */
  pagesFail: 503 | 404 | null;
  /** Published site text; `null` = the pages route serves the pre-text body. */
  text: MockText | null;
  /** The pages route answers `{ version, data, text: null }`. */
  textNull: boolean;
  /** The signed-in customer is refused: the personalised routes answer 403 ACCESS_DENIED and the profile says `shopAccess: false`. Flip it mid-test to grant access. */
  denied: boolean;
  /** References cancelled through either cancel route, in order. */
  cancels: string[];
  /** How many times the anonymous catalogue (`catalog`, `catalog/products/:id`) was asked for. */
  anonymousCatalogHits: number;
}

export interface MockHandle {
  state: MockState;
  /** Flip the shop off mid-session, exactly as the backend's kill switch does:
   *  settings answers `enabled: false` and every non-order route 503s. */
  closeShop: () => void;
  /** API paths seen so far (without the `/api/` prefix). */
  requests: () => string[];
}

export const SESSION_TOKEN = 'e2e-session-token';
export const SESSION_CUSTOMER = { id: 4242, nickname: 'Ada' };

/** The one password account the mock knows: sign-in, and the "current password" when changing it. */
export const PASSWORD_ACCOUNT = { email: 'ada@example.invalid', phone: '+447700900123', password: 'correct horse battery' } as const;
/** Reset links the mock understands. Anything else is an unknown token (valid: false). */
export const RESET_TOKENS = { reset: 'RESET-OK', set: 'SET-OK', used: 'RESET-USED' } as const;
/** Verification links the mock understands. Anything else is a 400 VERIFY_LINK_INVALID. */
export const VERIFY_TOKENS = { ok: 'VERIFY-OK', other: 'VERIFY-OTHER' } as const;

const NO_PASSWORD: ProfilePassword = { set: false, loginEmail: null, loginPhone: null, emailVerified: false, phoneVerified: false };

const PENDING_POLLS = 2;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Mirrors the backend/`resolveUnitPrice`: highest `minQuantity` ≤ quantity wins. */
function unitPriceFor(product: Product, quantity: number): number {
  const tier = [...product.pricingTiers]
    .sort((a, b) => b.minQuantity - a.minQuantity)
    .find((t) => quantity >= t.minQuantity);
  return tier ? tier.price : product.price;
}

function buildCart(items: CartLineInput[], catalog: Catalog): ServerCart {
  const lines: ServerCartLine[] = [];
  for (const item of items) {
    const product = catalog.products.find((p) => p.id === item.productId);
    if (!product || item.quantity <= 0) continue;
    const unitPrice = unitPriceFor(product, item.quantity);
    // Mirrors the backend's `checkQuantity`: the mock flags rather than
    // rejects, exactly like the real cart write does — a fixture product with
    // no `minOrderQuantity`/`maxOrderQuantity` set is `undefined`, not `null`,
    // so this treats either as "no limit" the same way the real client does.
    const min = product.minOrderQuantity ?? null;
    const max = product.maxOrderQuantity ?? null;
    lines.push({
      productId: product.id,
      name: product.displayName,
      quantity: item.quantity,
      unitPrice,
      lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
      imageUrl: null,
      isPreorder: product.isPreorder,
      outOfStock: !product.inStock && !product.isPreorder,
      priceChanged: false,
      inactive: !product.isActive,
      belowMin: min != null && item.quantity < min,
      aboveMax: max != null && item.quantity > max,
      minOrderQuantity: min,
      maxOrderQuantity: max,
    });
  }
  return {
    items: lines,
    subtotal: Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

/** Synthetic collection points (no real shop, carrier account or address). */
export const DEFAULT_SERVICE_POINTS: ServicePoint[] = [
  { id: '9001', carrier: 'inpost', name: 'Northbound Locker A', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY', city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 320 },
  { id: '9002', carrier: 'evri', name: 'Corner News', street: 'Vicar Lane', houseNumber: '2', postalCode: 'LS1 7JH', city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 540 },
  { id: '9003', carrier: 'inpost', name: 'Station Locker', street: 'Station Road', houseNumber: '', postalCode: 'LS1 4DY', city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: null },
  { id: '9004', carrier: 'evri', name: 'Quayside Parcel Box', street: '', houseNumber: '', postalCode: 'LS1 5AB', city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 910 },
];

/** The one discount code the mock knows: 10% off the goods, `NORTH10`. Any other code leaves the quote as served. */
export const COUPON_CODE = 'NORTH10';
export const COUPON_DISCOUNT = 4.25;

/** The quote as the backend would price this request: the code, when it is the known one, takes the discount off every total. */
function quoteFor(base: Quote, asked: Record<string, unknown>): Quote {
  if (String(asked.couponCode ?? '').trim().toUpperCase() !== COUPON_CODE) return base;
  const q = clone(base);
  const take = (n: number) => Math.round((n - COUPON_DISCOUNT) * 100) / 100;
  q.coupon = { code: COUPON_CODE, discountAmount: COUPON_DISCOUNT, shippingDiscount: 0, autoApplied: false };
  q.grandTotal = take(q.grandTotal);
  q.amountDue = take(q.amountDue);
  for (const m of q.paymentMethods) {
    m.chargeTotal = take(m.chargeTotal);
    for (const o of m.cryptoOptions ?? []) o.chargeTotal = take(o.chargeTotal);
  }
  return q;
}

function maskTxid(txid: string): string {
  const t = txid.trim();
  return t.length > 14 ? `${t.slice(0, 6)}…${t.slice(-6)}` : t;
}

const GOOGLE_FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

/**
 * What the catch-all route does with a request that leaves the dev server. Default: abort
 * (hermetic). E2E_REAL_FONTS=1 lets the two Google Fonts hosts through so template
 * screenshots and preview images use the real faces; nothing else is ever let out.
 */
export function externalRequestPolicy(url: string, env: Record<string, string | undefined> = process.env): 'continue' | 'abort' {
  return env.E2E_REAL_FONTS === '1' && GOOGLE_FONTS.test(url) ? 'continue' : 'abort';
}

async function envelope(route: Route, data: unknown, meta?: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(meta === undefined ? { success: true, data, error: null } : { success: true, data, error: null, meta }),
  });
}

async function fail(route: Route, status: number, error: string): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, data: null, error }),
  });
}

function body(route: Route): Record<string, unknown> {
  try {
    return (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Every network call the app can make, answered from fixtures. No backend, no
 * Worker: `installMocks` must be awaited before the first navigation, because
 * the session seed is an init script and the settings fetch is the app's very
 * first request.
 */
export async function installMocks(page: Page, options: InstallMocksOptions = {}): Promise<MockHandle> {
  const layout = options.layout ?? 'storefront';
  const profileFixture = read<ProfileFixture>('profile.json');
  const trackingFixture = read<TrackingFixture>('tracking.json');

  const state: MockState = {
    settings: options.settings ?? (() => {
      const s = read<StorefrontSettings>(`settings.${layout === 'webapp' ? 'menu' : layout}.json`);
      s.features.layout = layout;
      return s;
    })(),
    catalog: options.catalog ?? read<Catalog>('catalog.json'),
    quote: options.quote ?? read<Quote>('quote.json'),
    order: options.order ?? read<PublicOrder>('public-order.json'),
    profile: options.profile ?? clone(profileFixture.profile),
    redeemOptions: clone(profileFixture.redeemOptions),
    orders: clone(profileFixture.orders),
    orderDetail: clone(profileFixture.orderDetail),
    tracking: clone(trackingFixture.lookup),
    verification: clone(trackingFixture.verification),
    cart: { items: [], subtotal: 0, itemCount: 0 },
    disabled: false,
    attemptPolls: 0,
    requests: [],
    checkouts: [],
    guestQuotes: [],
    quotes: [],
    servicePointSearches: [],
    methods: [],
    txids: [],
    webappLogins: [],
    oidcCalls: [],
    botModes: [],
    passwordCalls: [],
    codeCalls: [],
    pages: options.pages ?? {},
    pagesFail: options.pagesFail ?? null,
    text: options.text ?? null,
    textNull: options.textNull ?? false,
    denied: options.access?.denied ?? false,
    anonymousCatalogHits: 0,
    cancels: [],
  };
  if (options.orderFixture) {
    const fixture = orderFixture(options.orderFixture, options.orderReference);
    state.orderDetail = fixture.detail;
    if (!options.order) state.order = fixture.payment;
  }
  options.tweakOrder?.(state.order);

  options.tweakSettings?.(state.settings);
  options.tweakProfile?.(state.profile);
  options.tweakOrderDetail?.(state.orderDetail);
  if (options.paymentMethods) {
    state.quote = { ...clone(state.quote), paymentMethods: clone(options.paymentMethods) };
    for (const p of state.orderDetail.payments) {
      const named = options.paymentMethods.find((m) => m.method === p.method);
      if (named) p.methodLabel = named.displayName;
    }
  }
  if (options.access) {
    const { denied: _denied, ...asked } = options.access;
    state.settings.access = { ...state.settings.access!, ...asked };
    if (asked.registration === false) state.settings.features.guestCheckout = false;
  }
  const oidcOptions = options.telegramOidc === true ? {} : options.telegramOidc || null;
  if (oidcOptions) {
    state.settings.login.telegram = { available: true, botUsername: state.settings.login.telegram.botUsername ?? 'northbound_bot', oidc: true };
  }
  const passwordOptions: { resetByEmail?: boolean; resetByWhatsapp?: boolean; throttled?: boolean } | null =
    options.passwordLogin === true ? {} : options.passwordLogin || null;
  if (passwordOptions) {
    state.settings.login.password = {
      available: true,
      resetByEmail: passwordOptions.resetByEmail ?? false,
      resetByWhatsapp: passwordOptions.resetByWhatsapp ?? false,
    };
    state.profile.password ??= { ...NO_PASSWORD };
  }
  const codeOptions = options.codeLogin ?? null;
  if (codeOptions) {
    const phone = codeOptions.phone ?? 'verify';
    const email = codeOptions.email ?? 'verify';
    state.settings.login.phone = phone === 'off' ? { available: false, mode: null, channels: [], countries: codeOptions.countries ?? [] }
      : phone === 'whatsapp' ? { available: true, mode: 'whatsapp', channels: [], countries: codeOptions.countries ?? [] }
        : { available: true, mode: 'verify', channels: ['whatsapp', 'sms'], countries: codeOptions.countries ?? [] };
    state.settings.login.email = email === 'off' ? { available: false, mode: null } : { available: true, mode: email };
  }
  /**
   * Whether the order can still be paid or cancelled: pending, with no completed payment. An order the mock holds no
   * state for (the unpaid list's other entries) is open until it is cancelled.
   */
  const orderIsOpen = (reference: string): boolean => {
    if (state.cancels.includes(reference)) return false;
    const completed = (state.order.reference === reference && (state.order.payment?.activePayment?.status === 'completed' || state.order.status !== 'pending'))
      || (state.orderDetail.reference === reference && (state.orderDetail.status !== 'pending' || state.orderDetail.payments.some((p) => p.status === 'completed')));
    return !completed;
  };

  /**
   * What choosing a method does to the order, as the backend's selection does: an open payment for the chosen method
   * (replacing any earlier one), and a total that carries the method's fee. Both views of the order are updated, so a
   * reload shows what the selection left behind.
   */
  const applySelection = (selection: Record<string, unknown>, result: SelectPaymentResult): void => {
    const chosen = state.quote.paymentMethods.find((m) => m.method === selection.method);
    const option = chosen?.cryptoOptions?.find((o) => o.coin === selection.coin && o.network === selection.network);
    const fee = option ?? chosen;
    const detail = state.orderDetail;
    if (detail.reference === state.order.reference) {
      if (fee) {
        const total = Math.round((detail.subtotal + detail.shippingAmount - detail.discountAmount + fee.fee) * 100) / 100;
        detail.totalAmount = total;
        detail.outstandingBalance = total;
        state.order.totals = { ...state.order.totals, totalAmount: total, paymentFeeAmount: fee.fee, paymentFeeLabel: fee.fee ? fee.feeLabel : null };
      }
      detail.payments = [
        ...detail.payments.filter((p) => p.status === 'completed'),
        { method: result.method, methodLabel: chosen?.displayName ?? result.method, amount: detail.totalAmount, status: 'pending', createdAt: new Date().toISOString() },
      ];
    }
    if (!state.order.payment) return;
    state.order.payment.activePayment = {
      paymentId: result.paymentId, method: result.method, kind: result.kind, status: 'pending', checkoutUrl: result.checkoutUrl, canChange: true,
    };
    if (result.crypto) {
      state.order.cryptoPayments = [{
        paymentId: result.paymentId, paymentStatus: 'pending', coin: result.crypto.coin, network: result.crypto.network,
        coinLabel: result.crypto.coinLabel, networkLabel: result.crypto.networkLabel, address: result.crypto.address,
        coinAmount: result.crypto.coinAmount, fiatAmount: result.crypto.fiatAmount, verificationStatus: 'pending', needsAttention: false, txidMasked: null,
      }];
    } else {
      state.order.cryptoPayments = [];
    }
  };

  /** Both cancel routes: the backend's `{ reference, status: 'cancelled' }`, or 409 `ORDER_NOT_CANCELLABLE:<reason>`. */
  const answerCancel = async (route: Route, reference: string): Promise<void> => {
    const known = [state.order.reference, state.orderDetail.reference, ...(options.unpaidOrders ?? []).map((o) => o.reference)];
    if (!known.includes(reference)) {
      await fail(route, 404, 'Order not found');
      return;
    }
    if (!orderIsOpen(reference)) {
      await fail(route, 409, 'ORDER_NOT_CANCELLABLE:not_pending');
      return;
    }
    const answer = options.cancelAnswers ?? 'ok';
    if (answer !== 'ok') {
      if (answer === 409) {
        // What the refusal means: money may be on its way, so the order says so from now on.
        if (state.orderDetail.reference === reference) { state.orderDetail.canCancel = false; state.orderDetail.cancelBlockedBy = 'bank_transfer'; }
        if (state.order.reference === reference && state.order.payment) { state.order.payment.canCancel = false; state.order.payment.cancelBlockedBy = 'bank_transfer'; }
        await fail(route, 409, 'ORDER_NOT_CANCELLABLE:bank_transfer');
      } else {
        await fail(route, answer, 'Something went wrong');
      }
      return;
    }
    state.cancels.push(reference);
    if (state.orderDetail.reference === reference) {
      state.orderDetail.status = 'cancelled';
      state.orderDetail.outstandingBalance = 0;
      state.orderDetail.canCancel = false;
      state.orderDetail.cancelBlockedBy = null;
    }
    for (const o of state.orders) if (o.reference === reference) { o.status = 'cancelled'; o.outstandingBalance = 0; }
    if (state.order.reference === reference) {
      state.order.status = 'cancelled';
      state.order.cryptoPayments = [];
      state.order.payment = { canPay: false, canCancel: false, cancelBlockedBy: null, payBy: null, activePayment: null };
    }
    await envelope(route, { reference, status: 'cancelled' });
  };

  const code = { channel: 'whatsapp' as string, masked: '', isNew: true, wrong: 0 };
  state.disabled = !state.settings.enabled;

  if (options.session) {
    await page.addInitScript(
      (seed: { token: string; customer: { id: number; nickname: string } }) => {
        window.localStorage.setItem(
          'sf-session-v1',
          JSON.stringify({ state: { token: seed.token, customer: seed.customer }, version: 0 }),
        );
      },
      { token: SESSION_TOKEN, customer: SESSION_CUSTOMER },
    );
  }

  // Nothing outside the dev server and the (shimmed) challenge script should
  // ever be reached — a real request would hang the run. Only exception: Google
  // Fonts when E2E_REAL_FONTS=1 (see externalRequestPolicy).
  await page.route(/^https?:\/\/(?!localhost:5199|challenges\.cloudflare\.com)/, (route) =>
    externalRequestPolicy(route.request().url()) === 'continue' ? route.continue() : route.abort(),
  );

  if (oidcOptions) {
    // Telegram itself: it approves at once and sends the browser straight back with a code and state.
    await page.route('https://oauth.telegram.org/**', (route) =>
      route.fulfill({ status: 302, headers: { location: `${ORIGIN}/auth/telegram/callback?code=e2e-code&state=e2e-state` }, body: '' }),
    );
  }

  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: TURNSTILE_SHIM }),
  );

  await page.route(`${ORIGIN}/media/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    // No branding logo on file, so the header falls back to the wordmark.
    if (path.startsWith('/media/settings/branding/')) {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL_PNG });
  });

  await page.route(`${ORIGIN}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\//, '');
    const method = route.request().method();
    state.requests.push(`${method} ${path}`);

    // The kill switch: everything but the settings 503s.
    if (state.disabled && path !== 'storefront/settings') {
      await fail(route, 503, 'STOREFRONT_DISABLED');
      return;
    }

    if (path === 'storefront/settings' && method === 'GET') {
      await envelope(route, state.settings);
      return;
    }

    const pages = /^storefront\/pages\/(storefront|menu|webapp)$/.exec(path);
    if (pages && method === 'GET') {
      if (state.pagesFail) {
        await fail(route, state.pagesFail, state.pagesFail === 503 ? 'UNAVAILABLE' : 'Not found');
        return;
      }
      const set = state.pages[pages[1] as Layout] ?? null;
      if (state.textNull) {
        await envelope(route, { version: set ? 1 : 0, data: set, text: null });
        return;
      }
      if (!state.text) {
        await envelope(route, set ? { version: 1, data: set } : null);
        return;
      }
      await envelope(route, {
        version: set ? 1 : 0,
        data: set,
        text: {
          version: state.text.version ?? 1,
          locale: state.text.locale ?? 'en',
          formatLocale: state.text.formatLocale ?? '',
          shared: state.text.shared ?? {},
          layout: state.text.layout?.[pages[1] as Layout] ?? {},
        },
      });
      return;
    }

    // Shop access: a refused customer is turned away from every personalised route that
    // shops or buys; the anonymous catalogue is closed to everyone unless the shop is public.
    if (state.denied && (/^storefront\/(catalog|cart)(\/|$)/.test(path) || (method === 'POST' && /^storefront\/checkout(\/quote)?$/.test(path)))) {
      await fail(route, 403, 'ACCESS_DENIED');
      return;
    }
    if (/^catalog(\/products\/\d+)?$/.test(path) && method === 'GET') {
      state.anonymousCatalogHits += 1;
      if (state.settings.access?.storefront !== 'public') {
        await fail(route, 401, 'LOGIN_REQUIRED');
        return;
      }
    }

    // The personalised routes (`fetchCatalog`/`fetchProduct` in `web/src/api/catalog.ts`
    // call these first whenever a session is seeded) share the anonymous
    // endpoints' payload shape, so they're served from the same fixture state.
    if ((path === 'catalog' || path === 'storefront/catalog') && method === 'GET') {
      await envelope(route, state.catalog);
      return;
    }

    const product = /^(?:storefront\/)?catalog\/products\/(\d+)$/.exec(path);
    if (product && method === 'GET') {
      const found = state.catalog.products.find((p) => p.id === Number(product[1]));
      if (!found) {
        await fail(route, 404, 'Product not found');
        return;
      }
      await envelope(route, found);
      return;
    }

    if (path === 'storefront/cart') {
      if (method === 'GET') {
        await envelope(route, state.cart);
        return;
      }
      if (method === 'PUT') {
        const items = (body(route).items ?? []) as CartLineInput[];
        state.cart = buildCart(items, state.catalog);
        await envelope(route, state.cart);
        return;
      }
      if (method === 'DELETE') {
        state.cart = { items: [], subtotal: 0, itemCount: 0 };
        await envelope(route, state.cart);
        return;
      }
    }

    if (path === 'storefront/service-points' && method === 'GET') {
      const query = new URL(route.request().url()).searchParams;
      const postalCode = query.get('postalCode');
      const country = query.get('country');
      const answer = options.servicePoints ?? DEFAULT_SERVICE_POINTS;
      if (postalCode) state.servicePointSearches.push({ country, postalCode });
      if (typeof answer === 'number') {
        await route.fulfill({ status: answer, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, error: 'Service point search is temporarily unavailable. Please try again.' }) });
        return;
      }
      // Only the asked country's points: a client that searches the wrong country finds nothing.
      const here = answer.filter((p) => p.country === country);
      await envelope(route, { available: here.length > 0, carriers: [...new Set(here.map((p) => p.carrier))], points: postalCode ? here : [] });
      return;
    }

    if ((path === 'storefront/checkout/quote' || path === 'storefront/checkout/guest/quote') && method === 'POST') {
      const asked = body(route);
      if (path.includes('guest')) state.guestQuotes.push(asked);
      else state.quotes.push(asked);
      await envelope(route, quoteFor(state.quote, asked));
      return;
    }

    if ((path === 'storefront/checkout' || path === 'storefront/checkout/guest') && method === 'POST') {
      state.checkouts.push(body(route));
      const result: CheckoutResult = {
        reference: options.checkoutReference ?? ORDER_REF,
        publicUrl: `${ORIGIN}/order/${ORDER_REF}/${ORDER_KEY}`,
        status: 'pending',
        total: 46.03,
        payment: options.checkoutPayment ?? {
          type: 'crypto',
          paymentId: 9001,
          method: 'crypto_static',
          coin: 'usdt',
          network: 'polygon',
          coinLabel: 'USDT',
          networkLabel: 'Polygon',
          address: '0xE2E1a2b3c4d5e6f7089aabbccddeeff0011223344',
          coinAmount: '46.030000',
          fiatAmount: 46.03,
          qrData: 'polygon:0xE2E1a2b3c4d5e6f7089aabbccddeeff0011223344?amount=46.03',
          walletLinks: [],
        },
      };
      await envelope(route, result);
      return;
    }

    // Declared before `storefront/orders/:ref`, which would read "unpaid" as a reference.
    if (path === 'storefront/orders/unpaid' && method === 'GET') {
      if (!route.request().headers()['authorization']) {
        await fail(route, 401, 'Unauthorized');
        return;
      }
      await envelope(route, (options.unpaidOrders ?? []).filter((o) => orderIsOpen(o.reference)).slice(0, 5));
      return;
    }

    // The customer's own pay routes: the same payment view the removed key-based routes served, on the session.
    const ownPay = /^storefront\/orders\/([^/]+)\/(payment|payment-options|payment-method|crypto-txid)$/.exec(path);
    if (ownPay) {
      const [, askedRef, tail] = ownPay;
      if (!route.request().headers()['authorization']) {
        await fail(route, 401, 'Unauthorized');
        return;
      }
      if (options.payRoutesGone || decodeURIComponent(askedRef!) !== state.order.reference) {
        await fail(route, 404, 'Order not found');
        return;
      }
      if (tail === 'payment' && method === 'GET') {
        await envelope(route, state.order);
        return;
      }
      if (tail === 'payment-options' && method === 'GET') {
        // An order that is no longer open has nothing left to choose.
        const methods: PaymentMethod[] = orderIsOpen(state.order.reference) ? state.quote.paymentMethods : [];
        await envelope(route, methods);
        return;
      }
      if (tail === 'payment-method' && method === 'POST') {
        const selection = body(route);
        state.methods.push(selection);
        if (options.refuseMethodSelection) {
          await fail(route, 422, 'That payment method is not available for this order');
          return;
        }
        if (options.conflictMethodSelection) {
          await fail(route, 409, 'Another payment is already open on this order');
          return;
        }
        const chosen = state.quote.paymentMethods.find((m) => m.method === selection.method);
        if (chosen?.type === 'gateway') {
          // A hosted checkout: the order now has an open gateway payment, as the backend's would.
          const checkoutUrl = `https://pay.example.invalid/checkout/${state.order.reference}`;
          const hosted: SelectPaymentResult = { paymentId: 9003, method: chosen.method, kind: 'gateway', status: 'pending', checkoutUrl, crypto: null };
          applySelection(selection, hosted);
          await envelope(route, hosted);
          return;
        }
        const result: SelectPaymentResult = {
          paymentId: 9002,
          method: String(selection.method ?? 'crypto_static'),
          kind: 'crypto',
          status: 'pending',
          checkoutUrl: null,
          crypto: {
            coin: String(selection.coin ?? 'usdt'),
            network: String(selection.network ?? 'polygon'),
            coinLabel: 'USDT',
            networkLabel: 'Polygon',
            address: '0xE2E1a2b3c4d5e6f7089aabbccddeeff0011223344',
            coinAmount: '46.030000',
            fiatAmount: 46.03,
            verificationStatus: 'pending',
          },
        };
        applySelection(selection, result);
        await envelope(route, result);
        return;
      }
      if (tail === 'crypto-txid' && method === 'POST') {
        const submitted = body(route);
        state.txids.push(submitted);
        const payment = state.order.cryptoPayments?.[0];
        if (payment) {
          payment.verificationStatus = 'checking';
          payment.txidMasked = maskTxid(String(submitted.txid ?? ''));
        }
        await envelope(route, { verificationStatus: 'checking' });
        return;
      }
    }

    const ownCancel = /^storefront\/orders\/([^/]+)\/cancel$/.exec(path);
    if (ownCancel && method === 'POST') {
      if (!route.request().headers()['authorization']) {
        await fail(route, 401, 'Unauthorized');
        return;
      }
      await answerCancel(route, decodeURIComponent(ownCancel[1]!));
      return;
    }

    if (path === 'storefront/orders' && method === 'GET') {
      const meta: PageMeta = {
        page: 1,
        limit: 10,
        totalItems: state.orders.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };
      await envelope(route, state.orders, meta);
      return;
    }

    const orderDetail = /^storefront\/orders\/([^/]+)$/.exec(path);
    if (orderDetail && method === 'GET') {
      if (orderDetail[1] !== state.orderDetail.reference) {
        await fail(route, 404, 'Order not found');
        return;
      }
      await envelope(route, state.orderDetail);
      return;
    }

    if (path === 'storefront/profile' && method === 'GET') {
      await envelope(route, { ...state.profile, shopAccess: !state.denied });
      return;
    }

    if (path === 'storefront/profile/redeem-options' && method === 'GET') {
      await envelope(route, state.redeemOptions);
      return;
    }

    if (path === 'storefront/profile/redeem' && method === 'POST') {
      await envelope(route, {
        pointsDeducted: 500,
        creditAwarded: 5,
        newPointsBalance: 740,
        newCreditBalance: 17.5,
      });
      return;
    }

    if (path === 'storefront/profile/referral-code' && method === 'POST') {
      await envelope(route, { referrerNickname: 'Bea' });
      return;
    }

    if (path === 'storefront/auth/telegram-webapp' && method === 'POST') {
      state.webappLogins.push(body(route));
      if (options.telegramAuthFails) {
        await fail(route, 401, 'Telegram web app session expired');
        return;
      }
      const result: LoginResult = { token: SESSION_TOKEN, customer: SESSION_CUSTOMER };
      await envelope(route, result);
      return;
    }

    if (path === 'storefront/account/bot-mode' && method === 'POST') {
      state.botModes.push(body(route));
      await envelope(route, { classic: body(route).classic === true });
      return;
    }

    if (path === 'storefront/auth/telegram/oidc/start' && method === 'POST') {
      state.oidcCalls.push({ route: 'start', body: body(route) });
      await envelope(route, { url: 'https://oauth.telegram.org/auth?state=e2e-state' });
      return;
    }

    if (path === 'storefront/auth/telegram/oidc/complete' && method === 'POST') {
      state.oidcCalls.push({ route: 'complete', body: body(route) });
      if (oidcOptions?.completeFails) {
        await fail(route, oidcOptions.completeFails.status, oidcOptions.completeFails.error);
        return;
      }
      const returnTo = state.oidcCalls.find((c) => c.route === 'start')?.body.returnTo ?? null;
      await envelope(route, { token: SESSION_TOKEN, customer: SESSION_CUSTOMER, returnTo });
      return;
    }

    const codeRoute = /^storefront\/auth\/code\/(email\/send|email|phone|resend|verify)$/.exec(path);
    if (codeRoute && method === 'POST' && codeOptions) {
      const asked = body(route);
      const which = codeRoute[1]!;
      state.codeCalls.push({ route: which, body: asked });
      const sends = which !== 'verify';
      if (sends && codeOptions.down) { await fail(route, 503, 'CODE_SERVICE_UNAVAILABLE'); return; }
      const sent = (channel: string, masked: string) => {
        code.channel = channel;
        code.masked = masked;
        code.wrong = 0;
        return { next: 'code', attemptId: 'code-attempt-1', channel, maskedTo: masked, resendAfter: 60 };
      };
      switch (which) {
        case 'email':
        case 'email/send': {
          const address = String(asked.email ?? '');
          code.isNew = address !== PASSWORD_ACCOUNT.email;
          if (which === 'email' && address === PASSWORD_ACCOUNT.email) { await envelope(route, { next: 'password' }); return; }
          await envelope(route, sent('email', `${address.slice(0, 1)}•••@${address.split('@')[1] ?? ''}`));
          return;
        }
        case 'phone': {
          const channel = String(asked.channel ?? '');
          if ((codeOptions.unavailableChannels ?? []).includes(channel as 'whatsapp' | 'sms')) { await fail(route, 400, 'CODE_CHANNEL_UNAVAILABLE'); return; }
          // The backend's normalisePhone (libphonenumber, GB) turns +4407700900123 into +447700900123; mirror it.
          code.isNew = String(asked.phone ?? '').replace(/^\+440/, '+44') !== PASSWORD_ACCOUNT.phone;
          await envelope(route, sent(channel, '+44 ••• ••• 123'));
          return;
        }
        case 'resend': {
          const channel = asked.channel ? String(asked.channel) : code.channel;
          if ((codeOptions.unavailableChannels ?? []).includes(channel as 'whatsapp' | 'sms')) { await fail(route, 400, 'CODE_CHANNEL_UNAVAILABLE'); return; }
          const keep = code.wrong;
          const answer = sent(channel, code.masked);
          code.wrong = keep;
          await envelope(route, answer);
          return;
        }
        default: {
          if (codeOptions.expired) { await fail(route, 400, 'CODE_EXPIRED'); return; }
          if (codeOptions.verifyError === 'tooManyTries') { await fail(route, 400, 'CODE_TOO_MANY_TRIES'); return; }
          if (codeOptions.verifyError === 'rateLimited') { await fail(route, 429, 'CODE_RATE_LIMITED'); return; }
          if (String(asked.code) === '123456') {
            if (code.isNew && state.settings.access?.registration === false) { await fail(route, 403, 'REGISTRATION_CLOSED'); return; }
            await envelope(route, { status: 'signed_in', token: SESSION_TOKEN, customer: SESSION_CUSTOMER, isNew: code.isNew });
            return;
          }
          const remaining = Math.max(0, 3 - code.wrong);
          code.wrong += 1;
          await envelope(route, { status: 'incorrect', attemptsRemaining: remaining });
          return;
        }
      }
    }

    if (path === 'storefront/auth/whatsapp/start' && method === 'POST') {
      state.attemptPolls = 0;
      const start: WhatsappStart = {
        attemptId: 'attempt-e2e-1',
        attemptSecret: 'secret-e2e-1',
        code: 'NB-4417',
        waLink: 'https://wa.me/447700900123?text=NB-4417',
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      };
      await envelope(route, start);
      return;
    }

    if (/^storefront\/auth\/attempts\/[^/]+$/.test(path) && method === 'GET') {
      state.attemptPolls += 1;
      await envelope(route, {
        status: state.attemptPolls > PENDING_POLLS ? 'completed' : 'pending',
      });
      return;
    }

    if (path === 'storefront/auth/whatsapp/complete' && method === 'POST') {
      const result: LoginResult = { token: SESSION_TOKEN, customer: SESSION_CUSTOMER };
      await envelope(route, result);
      return;
    }

    const passwordRoute = `${method} ${path}`;
    if (/^(POST storefront\/auth\/(password\/(signup|login|forgot|reset\/check|reset)|email\/(verification|verify))|PUT storefront\/account\/password)$/.test(passwordRoute)) {
      const asked = body(route);
      state.passwordCalls.push({ route: passwordRoute, body: asked, authorization: route.request().headers()['authorization'] ?? null });
      const session: LoginResult = { token: SESSION_TOKEN, customer: SESSION_CUSTOMER };
      // libphonenumber drops the trunk zero after +44; the mock does the same so "07700 900123" under GB matches the account.
      const phone = String(asked.phone ?? '').replace(/^\+440/, '+44');
      const known = asked.email === PASSWORD_ACCOUNT.email || phone === PASSWORD_ACCOUNT.phone;
      switch (passwordRoute) {
        case 'POST storefront/auth/password/signup':
          if (state.settings.access?.registration === false) await fail(route, 403, 'REGISTRATION_CLOSED');
          else if (known) await fail(route, 409, "That email or phone can't be used to create an account. Try signing in or resetting your password.");
          else await envelope(route, session, undefined, 201);
          return;
        case 'POST storefront/auth/password/login':
          if (passwordOptions?.throttled) await fail(route, 429, 'Too many requests');
          else if (known && asked.password === PASSWORD_ACCOUNT.password) await envelope(route, session);
          else await fail(route, 401, 'Invalid credentials');
          return;
        case 'POST storefront/auth/password/forgot':
          await envelope(route, { ok: true });
          return;
        case 'POST storefront/auth/password/reset/check': {
          const check: ResetCheck = asked.token === RESET_TOKENS.reset ? { valid: true, mode: 'reset' }
            : asked.token === RESET_TOKENS.set ? { valid: true, mode: 'set' } : { valid: false, mode: null };
          await envelope(route, check);
          return;
        }
        case 'POST storefront/auth/password/reset':
          if (asked.token === RESET_TOKENS.used || (asked.token !== RESET_TOKENS.reset && asked.token !== RESET_TOKENS.set)) await fail(route, 400, 'RESET_LINK_INVALID');
          else if (String(asked.password ?? '').length < 8) await fail(route, 422, 'Password must be at least 8 characters');
          else await envelope(route, session);
          return;
        case 'PUT storefront/account/password': {
          if (!route.request().headers()['authorization']) {
            await fail(route, 401, 'Unauthorized');
            return;
          }
          const hasIdentity = state.profile.identities.email || state.profile.identities.whatsapp;
          if (hasIdentity && (asked.email || asked.phone)) {
            await fail(route, 422, 'Email and phone cannot be changed here');
            return;
          }
          if (state.profile.password?.set && asked.currentPassword !== PASSWORD_ACCOUNT.password) {
            await fail(route, 422, 'CURRENT_PASSWORD_INCORRECT');
            return;
          }
          state.profile.password = {
            ...(state.profile.password ?? NO_PASSWORD), set: true,
            loginEmail: state.profile.password?.loginEmail ?? (asked.email ? String(asked.email) : null),
          };
          await envelope(route, { ok: true });
          return;
        }
        case 'POST storefront/auth/email/verification':
          await envelope(route, { ok: true });
          return;
        case 'POST storefront/auth/email/verify':
          if (asked.token === VERIFY_TOKENS.ok) {
            state.profile.password = { ...(state.profile.password ?? NO_PASSWORD), emailVerified: true };
            await envelope(route, { ok: true });
          } else if (asked.token === VERIFY_TOKENS.other) {
            await fail(route, 403, 'Forbidden');
          } else {
            await fail(route, 400, 'VERIFY_LINK_INVALID');
          }
          return;
      }
    }

    if (path === 'storefront/auth/logout' && method === 'POST') {
      await envelope(route, null);
      return;
    }

    if (path === 'storefront/tracking' && method === 'POST') {
      const reference = String(body(route).reference ?? '');
      if (reference !== state.tracking.reference) {
        await fail(route, 404, 'Order not found');
        return;
      }
      await envelope(route, state.tracking);
      return;
    }

    const verify = /^verify\/([^/]+)\/(\d+)$/.exec(path);
    if (verify && method === 'GET') {
      if (verify[1] !== 'AB3D-SKU12' || verify[2] !== '123456') {
        await fail(route, 404, 'Not found');
        return;
      }
      await envelope(route, state.verification);
      return;
    }

    await fail(route, 404, `Unmocked route: ${method} ${path}`);
  });

  return {
    state,
    closeShop: () => {
      state.settings = { ...state.settings, enabled: false };
      state.disabled = true;
    },
    requests: () => [...state.requests],
  };
}
