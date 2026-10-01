import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { ComponentData, DocKey } from '@/builder/types.ts';
import type { OrderDetail, OrderSummary } from '@/types/orders.ts';
import type { Profile, RedeemOptions } from '@/types/profile.ts';

/** A TanStack-shaped query result; only the fields the account pages read. */
interface Q<T> { data?: T; isPending: boolean; isError: boolean; error?: unknown; refetch: () => void }
interface OrdersQ { data?: { pages: Array<{ data: OrderSummary[]; meta: { totalItems: number; page: number; hasNextPage: boolean } }> }; isPending: boolean; isError: boolean; hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => void; refetch: () => void }

// The goldens were captured in Europe/London: pin it so a UTC or US machine formats the same dates and times.
vi.hoisted(() => { process.env.TZ = 'Europe/London'; });

const s = vi.hoisted(() => ({
  profile: null as unknown, orders: null as unknown, order: null as unknown, redeem: null as unknown,
  inTelegram: false, layout: 'storefront', mode: 'off', links: { whatsapp: null, telegram: null } as { whatsapp: string | null; telegram: string | null },
  claimFails: false,
}));

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: s.links },
    telegramWebApp: { mode: s.mode },
    features: { layout: s.layout, ordering: true, accounts: true },
  }) as unknown as StorefrontSettings,
}));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => s.layout }));
vi.mock('@/lib/telegram-webapp.ts', async (orig) => ({ ...(await orig<typeof import('@/lib/telegram-webapp.ts')>()), isTelegramWebApp: () => s.inTelegram, tgClose: () => {} }));
vi.mock('@/features/account/queries.ts', async (orig) => ({
  ...(await orig<typeof import('@/features/account/queries.ts')>()),
  useProfile: () => s.profile, useOrders: () => s.orders, useOrder: () => s.order, useRedeemOptions: () => s.redeem,
}));
vi.mock('@/api/profile.ts', async () => {
  const { ApiError } = await import('@/lib/errors.ts');
  return {
    redeem: async () => { throw new Error('unused'); },
    setBotMode: async () => ({ classic: true }),
    setReferralCode: async () => { if (s.claimFails) throw new ApiError(400, 'That code does not belong to anyone.'); return { referrerNickname: 'Ada' }; },
  };
});
vi.mock('@/api/auth.ts', () => ({ logout: () => new Promise(() => {}) }));

import { AccountLayout } from '@/features/account/AccountLayout.tsx';
import { OrdersPage } from '@/features/account/OrdersPage.tsx';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import { LoyaltyPage } from '@/features/account/LoyaltyPage.tsx';
import { ReferralsPage } from '@/features/account/ReferralsPage.tsx';
import { ProfilePage } from '@/features/account/ProfilePage.tsx';
import { ApiError } from '@/lib/errors.ts';
import { useSessionStore } from '@/stores/session.ts';
import { expectStage4, mountAt, mountDefault, mountDoc, type Mounted } from './helpers/stage4-golden.tsx';

const noop = () => {};
const pending = { data: undefined, isPending: true, isError: false, refetch: noop };
const errored = { data: undefined, isPending: false, isError: true, error: new Error('boom'), refetch: noop };
const ok = <T,>(data: T): Q<T> => ({ data, isPending: false, isError: false, refetch: noop });

const PROFILE: Profile = {
  loyaltyPoints: 1250, storeCreditBalance: 7.5, referralCode: 'NORTH-4F2A', referralsCount: 3, referredPeopleCount: 2,
  hasReferrer: false, referrerNickname: null, totalOrders: 4, totalSpend: 182.4, memberSince: '2026-03-04T12:00:00.000Z',
  nickname: 'Ada', identities: { telegram: true, whatsapp: false, email: true },
};

const order = (reference: string, status: string, total: number, due = 0): OrderSummary => ({ reference, status, createdAt: '2026-08-12T12:00:00.000Z', totalAmount: total, outstandingBalance: due });
const ORDER_ROWS: OrderSummary[] = [
  order('K4M2QP', 'pending', 42.5, 12.5), order('J7N1XD', 'confirmed', 18), order('H3B9TR', 'shipped', 64.2),
  order('G2C8LW', 'delivered', 31), order('F6V5ZK', 'cancelled', 9.99),
];
const ordersQ = (rows: OrderSummary[], more = false, fetching = false): OrdersQ => ({
  data: { pages: [{ data: rows, meta: { totalItems: more ? 23 : rows.length, page: 1, hasNextPage: more } }] },
  isPending: false, isError: false, hasNextPage: more, isFetchingNextPage: fetching, fetchNextPage: noop, refetch: noop,
});

const DETAIL: OrderDetail = {
  reference: 'K4M2QP', status: 'shipped', createdAt: '2026-08-12T12:00:00.000Z',
  items: [
    { name: 'Oat Bar', quantity: 3, unitPrice: 4.5, lineTotal: 13.5 },
    { name: 'Hazel Spread', quantity: 1, unitPrice: 8, lineTotal: 8 },
  ],
  subtotal: 21.5, shippingAmount: 3.5, discountAmount: 2, totalAmount: 23, outstandingBalance: 10,
  payments: [
    { method: 'bank_transfer', amount: 13, status: 'completed', createdAt: '2026-08-12T12:30:00.000Z' },
    { method: 'crypto-btc', amount: 10, status: 'pending', createdAt: '2026-08-13T12:30:00.000Z' },
  ],
  shipments: [
    { status: 'shipped', carrier: 'Royal Mail', trackingNumber: 'RM123456789GB', trackingUrl: 'https://track.example/RM123456789GB', trackingStatusDescription: 'In transit to the depot', shippedAt: '2026-08-14T12:00:00.000Z', deliveredAt: null },
    { status: 'unknown_state', carrier: null, trackingNumber: null, trackingUrl: null, trackingStatusDescription: null, shippedAt: null, deliveredAt: null },
  ],
  publicUrl: 'https://shop.example/o/K4M2QP/abc',
};

const LADDER: RedeemOptions = {
  loyaltyPoints: 1250,
  options: [
    { id: 1, label: '5 pounds store credit', pointsCost: 500, creditValue: 5, affordable: true },
    { id: 2, label: '10 pounds store credit', pointsCost: 1000, creditValue: 10, affordable: true },
    { id: 3, label: '25 pounds store credit', pointsCost: 2500, creditValue: 25, affordable: false },
  ],
};

function reset() {
  s.profile = pending; s.orders = pending; s.order = pending; s.redeem = ok<RedeemOptions | null>(null);
  s.inTelegram = false; s.layout = 'storefront'; s.mode = 'off'; s.links = { whatsapp: null, telegram: null }; s.claimFails = false;
  useSessionStore.setState({ token: null, customer: null });
}
beforeEach(reset);
afterEach(() => {
  cleanup();
  for (const k of ['share', 'clipboard'] as const) Reflect.deleteProperty(navigator, k);
});

async function settle(m: Mounted): Promise<string> {
  let prev = '';
  for (let i = 0; i < 80; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 15)); });
    const cur = m.container.innerHTML;
    if (cur !== '' && cur === prev) return cur;
    prev = cur;
  }
  throw new Error('stage4 harness: the render never settled');
}

interface Case {
  name: string; docKey: DocKey; section: string; path: string; page: ReactNode;
  setup?: () => void; act?: (m: Mounted) => Promise<void> | void;
}

const click = async (m: Mounted, text: string, nth = 0) => {
  const el = [...m.container.querySelectorAll('button')].filter((b) => b.textContent === text && !b.disabled)[nth];
  if (!el) throw new Error(`stage4 harness: no enabled "${text}" button`);
  await act(async () => { fireEvent.click(el); });
};

async function runCase(c: Case) {
  const opts = { path: c.path, route: c.path.startsWith('/account/orders/') ? '/account/orders/:ref' : '/account/*' };
  const one = async (mount: () => Mounted) => {
    c.setup?.();
    const m = mount();
    let html = await settle(m);
    if (c.act) { await c.act(m); html = await settle(m); }
    expectStage4(c.name, html);
    cleanup();
    reset();
  };
  await one(() => mountAt(<AccountLayout>{c.page}</AccountLayout>, opts));
  await one(() => mountDefault(c.docKey, 'storefront', opts));
  const stored: ComponentData = { type: 'AccountNav', props: { id: 'AccountNav-default', body: [{ type: c.section, props: { id: `${c.section}-default` } }] } };
  await one(() => mountDoc(c.docKey, 'storefront', [stored], opts));
}

const cases: Case[] = [];
const add = (c: Case) => cases.push(c);
const profileQ = (over: Partial<Profile> = {}) => ok({ ...PROFILE, ...over });

// ---------------------------------------------------------------- nav
const nav = (name: string, setup: () => void) => add({ name: `account-nav-${name}`, docKey: 'account.orders', section: 'OrdersList', path: '/account/orders', page: <OrdersPage />, setup });
nav('session-name-standing', () => { useSessionStore.setState({ token: 't', customer: { id: 1, nickname: 'Sam' } }); s.profile = profileQ(); });
nav('profile-name-standing', () => { s.profile = profileQ(); });
nav('no-name-standing', () => { s.profile = profileQ({ nickname: null }); });
nav('session-name-no-standing', () => { useSessionStore.setState({ token: 't', customer: { id: 1, nickname: 'Sam' } }); });
nav('no-name-no-standing', () => {});
add({ name: 'account-nav-tab-orders', docKey: 'account.orders', section: 'OrdersList', path: '/account/orders', page: <OrdersPage />, setup: () => { s.profile = profileQ(); s.orders = ordersQ(ORDER_ROWS); } });
add({ name: 'account-nav-tab-loyalty', docKey: 'account.loyalty', section: 'Loyalty', path: '/account/loyalty', page: <LoyaltyPage />, setup: () => { s.profile = profileQ(); } });
add({ name: 'account-nav-tab-referrals', docKey: 'account.referrals', section: 'Referrals', path: '/account/referrals', page: <ReferralsPage />, setup: () => { s.profile = profileQ(); } });
add({ name: 'account-nav-tab-profile', docKey: 'account.profile', section: 'Profile', path: '/account/profile', page: <ProfilePage />, setup: () => { s.profile = profileQ(); } });
add({ name: 'account-nav-tab-order', docKey: 'account.order', section: 'OrderDetail', path: '/account/orders/K4M2QP', page: <OrderDetailPage />, setup: () => { s.profile = profileQ(); s.order = ok(DETAIL); } });

// ---------------------------------------------------------------- orders
const ordersCase = (name: string, setup: () => void) => add({ name: `account-orders-${name}`, docKey: 'account.orders', section: 'OrdersList', path: '/account/orders', page: <OrdersPage />, setup });
ordersCase('pending', () => { s.orders = pending; });
ordersCase('error', () => { s.orders = errored; });
ordersCase('empty', () => { s.orders = ordersQ([]); });
ordersCase('list', () => { s.orders = ordersQ(ORDER_ROWS); });
ordersCase('next-page', () => { s.orders = ordersQ(ORDER_ROWS, true); });
ordersCase('next-page-fetching', () => { s.orders = ordersQ(ORDER_ROWS, true, true); });

// ---------------------------------------------------------------- order
const orderCase = (name: string, setup: () => void) => add({ name: `account-order-${name}`, docKey: 'account.order', section: 'OrderDetail', path: '/account/orders/K4M2QP', page: <OrderDetailPage />, setup });
orderCase('pending', () => { s.order = pending; });
orderCase('error', () => { s.order = errored; });
orderCase('not-found', () => { s.order = { ...errored, error: new ApiError(404, 'NOT_FOUND') }; });
orderCase('full', () => { s.order = ok(DETAIL); });
orderCase('no-balance', () => { s.order = ok({ ...DETAIL, outstandingBalance: 0 }); });
orderCase('no-payments', () => { s.order = ok({ ...DETAIL, payments: [] }); });
orderCase('no-parcels', () => { s.order = ok({ ...DETAIL, shipments: [] }); });
orderCase('no-public-url', () => { s.order = ok({ ...DETAIL, publicUrl: null }); });

// ---------------------------------------------------------------- loyalty
const loyaltyCase = (name: string, setup: () => void, run?: Case['act']) => add({ name: `account-loyalty-${name}`, docKey: 'account.loyalty', section: 'Loyalty', path: '/account/loyalty', page: <LoyaltyPage />, setup, act: run });
loyaltyCase('pending', () => { s.profile = pending; });
loyaltyCase('error', () => { s.profile = errored; });
loyaltyCase('ladder', () => { s.profile = profileQ(); s.redeem = ok(LADDER); });
loyaltyCase('no-points', () => { s.profile = profileQ({ loyaltyPoints: 0, storeCreditBalance: 0 }); s.redeem = ok({ loyaltyPoints: 0, options: LADDER.options.map((o) => ({ ...o, affordable: false })) }); });
loyaltyCase('store-credit', () => { s.profile = profileQ({ storeCreditBalance: 12 }); });
loyaltyCase('ladder-empty', () => { s.profile = profileQ(); s.redeem = ok({ loyaltyPoints: 1250, options: [] }); });
loyaltyCase('redeem-confirm', () => { s.profile = profileQ(); s.redeem = ok(LADDER); }, (m) => click(m, 'Redeem'));

// ---------------------------------------------------------------- referrals
const share = () => {
  Object.defineProperty(navigator, 'share', { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
};
const referralsCase = (name: string, setup: () => void, run?: Case['act']) => add({ name: `account-referrals-${name}`, docKey: 'account.referrals', section: 'Referrals', path: '/account/referrals', page: <ReferralsPage />, setup, act: run });
referralsCase('pending', () => { s.profile = pending; });
referralsCase('error', () => { s.profile = errored; });
referralsCase('not-referred', () => { s.profile = profileQ(); });
referralsCase('referred', () => { s.profile = profileQ({ hasReferrer: true, referrerNickname: 'Grace' }); });
referralsCase('referred-anonymous', () => { s.profile = profileQ({ hasReferrer: true, referrerNickname: null }); });
referralsCase('share-none', () => { s.profile = profileQ(); });
referralsCase('share-some', () => { s.profile = profileQ(); s.links = { whatsapp: 'https://wa.me/447700900123', telegram: 'https://t.me/northbound' }; share(); });
referralsCase('share-native-only', () => { s.profile = profileQ(); share(); });
const claimTyped = async (m: Mounted) => {
  const input = m.container.querySelector('input')!;
  await act(async () => { fireEvent.change(input, { target: { value: 'WRONG-1' } }); });
  await click(m, 'Apply');
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
};
referralsCase('claim-error', () => { s.profile = profileQ(); s.claimFails = true; }, claimTyped);

// ---------------------------------------------------------------- profile
const profileCase = (name: string, setup: () => void, run?: Case['act']) => add({ name: `account-profile-${name}`, docKey: 'account.profile', section: 'Profile', path: '/account/profile', page: <ProfilePage />, setup, act: run });
profileCase('pending', () => { s.profile = pending; });
profileCase('error', () => { s.profile = errored; });
profileCase('website', () => { s.profile = profileQ(); });
profileCase('website-no-name', () => { s.profile = profileQ({ nickname: null, identities: { telegram: false, whatsapp: false, email: false } }); });
profileCase('webapp-chat-links', () => { s.profile = profileQ(); s.layout = 'webapp'; s.links = { whatsapp: 'https://wa.me/447700900123', telegram: 'https://t.me/northbound' }; });
profileCase('webapp-no-chat-links', () => { s.profile = profileQ(); s.layout = 'webapp'; });
profileCase('telegram', () => { s.profile = profileQ(); s.layout = 'webapp'; s.inTelegram = true; s.mode = 'forced'; });
profileCase('telegram-beta', () => { s.profile = profileQ(); s.layout = 'webapp'; s.inTelegram = true; s.mode = 'beta'; });
profileCase('telegram-beta-confirm', () => { s.profile = profileQ(); s.layout = 'webapp'; s.inTelegram = true; s.mode = 'beta'; }, (m) => click(m, 'Switch to the classic bot'));
profileCase('signing-out', () => { s.profile = profileQ(); }, (m) => click(m, 'Sign out'));

describe('stage 4 account goldens (v0.7.0)', () => {
  it('has unique case names', () => { expect(cases.length).toBeGreaterThanOrEqual(50); expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length); });
  it.each(cases.map((c) => [c.name, c] as const))('%s', async (_n, c) => { await runCase(c); });
});
