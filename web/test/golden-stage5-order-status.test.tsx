import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { ComponentData } from '@/builder/types.ts';
import type { PublicCryptoPayment, PublicOrder, Shipment } from '@/types/public-order.ts';
import type { PaymentMethod } from '@/types/checkout.ts';
import { OrderStatusPage } from '@/features/order-status/OrderStatusPage.tsx';
import { expectGolden } from './helpers/golden.ts';
import { mountAt, mountDefault, mountDoc, type Mounted } from './helpers/stage4-golden.tsx';

// The goldens were captured in Europe/London: pin it so a UTC or US machine formats the same dates and times.
vi.hoisted(() => { process.env.TZ = 'Europe/London'; });

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  order: (() => new Promise(() => {})) as () => Promise<unknown>,
  options: (() => Promise.resolve([])) as () => Promise<unknown>,
}));

vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings as unknown as StorefrontSettings }));
vi.mock('@/api/public-order.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/public-order.ts')>()),
  fetchPublicOrder: () => state.order(),
  fetchPaymentOptions: () => state.options(),
  selectPaymentMethod: () => new Promise(() => {}),
  submitCryptoTxid: () => new Promise(() => {}),
}));

import { InvalidLinkError } from '@/api/public-order.ts';
import { ApiError } from '@/lib/errors.ts';

const NOW = Date.parse('2026-07-07T12:00:00Z');
const PATH = '/order/NB0977/key1';
const ROUTE = '/order/:ref/:accessKey';
const iso = (d: string) => new Date(Date.parse(d)).toISOString();

function useSettingsState() {
  state.settings = {
    currency: 'GBP', enabled: true, supportLinks: [], notices: [], features: {},
    brand: {
      name: 'Northbound Supply', shortName: 'Northbound', title: 'Northbound Supply', tagline: null,
      links: { whatsapp: 'https://wa.me/447700900000', telegram: 'https://t.me/northbound_bot' },
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  useSettingsState();
  state.order = () => new Promise(() => {});
  state.options = () => Promise.resolve(METHODS);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

// ---------------------------------------------------------------- fixtures

const METHODS: PaymentMethod[] = [
  { slot: 'card', method: 'northpay', displayName: 'NorthPay', type: 'gateway', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 48.5 },
  {
    slot: 'crypto', method: 'crypto', displayName: 'Crypto', type: 'crypto', details: null, feeType: 'percent', feeValue: -3, feeRateText: '−3%', feeLabel: 'Crypto discount', fee: -1.46, chargeTotal: 47.04,
    cryptoOptions: [
      { coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon', feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 48.5 },
      { coin: 'btc', network: 'bitcoin', coinLabel: 'BTC', networkLabel: 'Bitcoin', feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 48.5 },
    ],
  },
];

const BASE: PublicOrder = {
  reference: 'NB0977',
  status: 'pending',
  createdAt: iso('2026-07-05T09:30:00Z'),
  deliveredAt: null,
  isPreorder: false,
  currency: 'GBP',
  items: [
    { productName: 'Trail Mix 500g', quantity: 2, unitPrice: 12, totalPrice: 24, isPreorder: false },
    { productName: 'Camp Mug', quantity: 1, unitPrice: 18.5, totalPrice: 18.5, isPreorder: false },
  ],
  totals: { subtotal: 42.5, shippingAmount: 6, discountAmount: 0, taxAmount: 0, totalAmount: 48.5 },
  shippingAddress: {
    firstName: 'Sam', surname: 'Carter', addressLine1: '12 Quay Street', addressLine2: null, addressLine3: null,
    city: 'Leeds', county: 'West Yorkshire', zip: 'LS1 4AB', country: 'GB',
  },
  shipments: [],
  cryptoPayments: [],
  payment: { canPay: false, payBy: null, activePayment: null },
};

const PAY_BY = iso('2026-07-09T18:00:00Z');
const canPay = (extra: Partial<NonNullable<PublicOrder['payment']>> = {}): PublicOrder['payment'] => ({ canPay: true, payBy: PAY_BY, activePayment: null, ...extra });

const CRYPTO: PublicCryptoPayment = {
  paymentId: 501, paymentStatus: 'pending', coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon',
  address: '0x4b1a9c3e5d7f20816a4b3c2d1e0f9a8b7c6d5e4f', coinAmount: '48.50', fiatAmount: 48.5,
  verificationStatus: 'pending', needsAttention: false, txidMasked: null,
};
const cryptoActive = (extra: Partial<NonNullable<PublicOrder['payment']>['activePayment'] & object> = {}) => ({
  paymentId: 501, method: 'crypto', kind: 'crypto' as const, status: 'pending', checkoutUrl: null, canChange: true, ...extra,
});

const PARCEL: Shipment = {
  status: 'in_transit', carrier: 'Royal Mail', trackingNumber: 'RM123456789GB', trackingUrl: 'https://track.example/RM123456789GB',
  trackingStatusDescription: 'Arrived at the Leeds delivery office', shippedAt: iso('2026-07-06T08:00:00Z'), deliveredAt: null,
};

const order = (o: Partial<PublicOrder>): PublicOrder => ({ ...BASE, ...o });

const CASES: { name: string; order: PublicOrder; drive?: (m: Mounted) => void | Promise<void> }[] = [
  { name: 'awaiting-payment', order: order({ payment: canPay() }) },
  {
    name: 'awaiting-changing',
    order: order({ payment: canPay({ activePayment: { paymentId: 410, method: 'northpay', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/s/410', canChange: true } }) }),
    drive: (m) => { fireEvent.click(m.container.querySelector('button[aria-expanded="false"]')!); },
  },
  { name: 'hosted-open', order: order({ payment: canPay({ activePayment: { paymentId: 410, method: 'northpay', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/s/410', canChange: true } }) }) },
  { name: 'pending-other', order: order({ payment: canPay({ activePayment: { paymentId: 411, method: 'bank', kind: 'other', status: 'pending', checkoutUrl: null, canChange: false } }) }) },
  { name: 'crypto-awaiting', order: order({ payment: canPay({ activePayment: cryptoActive() }), cryptoPayments: [CRYPTO] }) },
  {
    name: 'crypto-checking',
    order: order({ payment: canPay({ activePayment: cryptoActive({ canChange: false }) }), cryptoPayments: [{ ...CRYPTO, verificationStatus: 'checking', txidMasked: '1a2b3c…d4e5f6' }] }),
  },
  {
    name: 'crypto-attention',
    order: order({ payment: canPay({ activePayment: cryptoActive({ canChange: false }) }), cryptoPayments: [{ ...CRYPTO, verificationStatus: 'needs_review', needsAttention: true, txidMasked: '1a2b3c…d4e5f6' }] }),
  },
  { name: 'crypto-cancelled', order: order({ payment: canPay(), cryptoPayments: [{ ...CRYPTO, paymentStatus: 'cancelled' }] }) },
  { name: 'shipped', order: order({ status: 'shipped', shipments: [PARCEL] }) },
  {
    name: 'two-parcels',
    order: order({ status: 'partially_shipped', shipments: [PARCEL, { ...PARCEL, carrier: 'DPD', trackingNumber: 'DPD99887766', trackingUrl: null, trackingStatusDescription: null, status: 'shipped' }] }),
  },
  {
    name: 'delivered',
    order: order({ status: 'delivered', deliveredAt: iso('2026-07-08T10:15:00Z'), shipments: [{ ...PARCEL, status: 'delivered', deliveredAt: iso('2026-07-08T10:15:00Z'), trackingStatusDescription: 'Delivered, left with a neighbour' }] }),
  },
  { name: 'cancelled', order: order({ status: 'cancelled' }) },
  { name: 'refunded', order: order({ status: 'refunded' }) },
  { name: 'preorder', order: order({ status: 'confirmed', isPreorder: true, items: BASE.items.map((i) => ({ ...i, isPreorder: true })) }) },
  { name: 'paid-no-shipments', order: order({ status: 'confirmed' }) },
  { name: 'no-address', order: order({ status: 'confirmed', shippingAddress: null, shipments: [PARCEL] }) },
  { name: 'no-payment-block', order: (() => { const o = order({ status: 'confirmed' }); delete o.payment; delete o.cryptoPayments; return o; })() },
  { name: 'no-payment-block-crypto', order: (() => { const o = order({ cryptoPayments: [CRYPTO] }); delete o.payment; return o; })() },
];

// ---------------------------------------------------------------- harness

/** Lazy blocks and the order query resolve a tick or two after mount: wait until the markup stops changing. */
async function settle(m: Mounted): Promise<string> {
  let prev = '';
  for (let i = 0; i < 80; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 15)); });
    const cur = m.container.innerHTML;
    if (cur !== '' && cur === prev) return cur;
    prev = cur;
  }
  throw new Error('stage5 order-status harness: the render never settled');
}

/** Entry component, default document and a stored v0.7.0-shaped document must agree on one golden. */
async function threeWays(name: string, drive?: (m: Mounted) => void | Promise<void>): Promise<void> {
  const stored: ComponentData = { type: 'OrderStatus', props: { id: 'OrderStatus-1' } };
  const mounts: (() => Mounted)[] = [
    () => mountAt(<OrderStatusPage />, { path: PATH, route: ROUTE }),
    () => mountDefault('order-status', 'storefront', { path: PATH, route: ROUTE }),
    () => mountDoc('order-status', 'storefront', [stored], { path: PATH, route: ROUTE, root: { chrome: 'none' } }),
  ];
  for (const mount of mounts) {
    const m = mount();
    const html = await settle(m);
    if (drive) { await act(async () => { await drive(m); }); }
    expectGolden(`stage5-order-${name}`, drive ? await settle(m) : html);
    cleanup();
  }
}

describe('stage 5 order-status goldens (v0.7.0)', () => {
  it.each(CASES)('order-$name', async (c) => {
    state.order = () => Promise.resolve(c.order);
    await threeWays(c.name, c.drive);
  });

  it('order-loading', async () => {
    state.order = () => new Promise(() => {});
    await threeWays('loading');
  });

  it('order-invalid-link', async () => {
    state.order = () => Promise.reject(new InvalidLinkError());
    await threeWays('invalid-link');
  });

  it('order-network-error', async () => {
    state.order = () => Promise.reject(new ApiError(503, 'unavailable'));
    await threeWays('network-error');
  });

  it.each(['awaiting-payment', 'shipped'])('order-%s: menu and webapp layouts match the same golden', async (name) => {
    const c = CASES.find((x) => x.name === name)!;
    state.order = () => Promise.resolve(c.order);
    for (const layout of ['menu', 'webapp'] as const) {
      const m = mountDefault('order-status', layout, { path: PATH, route: ROUTE });
      expectGolden(`stage5-order-${name}`, await settle(m));
      cleanup();
    }
  });

  it('wide layout only when the action column has content', async () => {
    for (const [name, wide] of [['awaiting-payment', true], ['shipped', true], ['paid-no-shipments', false]] as const) {
      state.order = () => Promise.resolve(CASES.find((x) => x.name === name)!.order);
      const m = mountAt(<OrderStatusPage />, { path: PATH, route: ROUTE });
      const html = await settle(m);
      expect(/_pageWide_/.test(html), `${name} pageWide`).toBe(wide);
      expect(/_layoutWide_/.test(html), `${name} layoutWide`).toBe(wide);
      cleanup();
    }
    expect(screen).toBeDefined();
  });
});
