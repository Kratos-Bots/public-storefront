import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { PublicCryptoPayment, PublicOrder, Shipment } from '@/types/public-order.ts';
import type { PaymentMethod } from '@/types/checkout.ts';

// Pinned like the goldens: the dates these assertions never read still format the same everywhere.
vi.hoisted(() => { process.env.TZ = 'Europe/London'; });

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  order: (() => new Promise(() => {})) as () => Promise<unknown>,
  fetches: 0,
}));

vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings as unknown as StorefrontSettings }));
vi.mock('@/api/public-order.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/public-order.ts')>()),
  fetchPublicOrder: () => { state.fetches += 1; return state.order(); },
  fetchPaymentOptions: () => Promise.resolve(METHODS),
  selectPaymentMethod: () => new Promise(() => {}),
  submitCryptoTxid: () => new Promise(() => {}),
}));

import { BLOCKS } from '@/builder/registry.ts';
import { part, partId, type ContainerSpec } from '@/builder/parts.ts';
import { checkRules } from '@/builder/rules.ts';
import { upgradeDoc } from '@/builder/upgrade.ts';
import { validateDoc } from '@/builder/guard.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { BuilderModeProvider } from '@/builder/mode.ts';
import type { ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { ORDER_STATUS_CONTAINER } from '@/builder/blocks/_shared/order-status-container.ts';
import { OrderStatusPage } from '@/features/order-status/OrderStatusPage.tsx';
import { isTextKey, matchesTextPattern } from '@/text/registry.ts';
import { TEXT } from '@/text/registry.ts';
import { BOX, TEXT as TEXT_KEYS, VIS } from '@/builder/style/model.ts';
import { STAGE5_PARTS } from './helpers/stage5-parts.ts';
import { mountAt, mountDoc, mountDefault, type Mounted } from './helpers/stage4-golden.tsx';
import classes from '@/features/order-status/OrderStatus.module.css';

const NAMES = ['OrderStatusHero', 'OrderStatusPayment', 'OrderStatusShipments', 'OrderStatusItems', 'OrderStatusAddress', 'OrderStatusFooter'];
const REQUIRED = ['OrderStatusHero', 'OrderStatusPayment', 'OrderStatusShipments', 'OrderStatusItems', 'OrderStatusFooter'];
const PATH = '/order/NB0977/key1';
const ROUTE = '/order/:ref/:accessKey';

const iso = (d: string) => new Date(Date.parse(d)).toISOString();
const METHODS: PaymentMethod[] = [
  { slot: 'card', method: 'northpay', displayName: 'NorthPay', type: 'gateway', details: null, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 48.5 },
];
const BASE: PublicOrder = {
  reference: 'NB0977', status: 'pending', createdAt: iso('2026-07-05T09:30:00Z'), deliveredAt: null, isPreorder: false, currency: 'GBP',
  items: [{ productName: 'Trail Mix 500g', quantity: 2, unitPrice: 12, totalPrice: 24, isPreorder: false }],
  totals: { subtotal: 24, shippingAmount: 6, discountAmount: 0, taxAmount: 0, totalAmount: 30 },
  shippingAddress: { firstName: 'Sam', surname: 'Carter', addressLine1: '12 Quay Street', addressLine2: null, addressLine3: null, city: 'Leeds', county: 'West Yorkshire', zip: 'LS1 4AB', country: 'GB' },
  shipments: [], cryptoPayments: [], payment: { canPay: false, payBy: null, activePayment: null },
};
const PAY_BY = iso('2026-07-09T18:00:00Z');
const canPay = (extra: Partial<NonNullable<PublicOrder['payment']>> = {}): PublicOrder['payment'] => ({ canPay: true, payBy: PAY_BY, activePayment: null, ...extra });
const CRYPTO: PublicCryptoPayment = {
  paymentId: 410, paymentStatus: 'pending', coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon',
  address: '0x4b1a9c3e5d7f20816a4b3c2d1e0f9a8b7c6d5e4f', coinAmount: '30.00', fiatAmount: 30,
  verificationStatus: 'pending', needsAttention: false, txidMasked: null,
};
const PARCEL: Shipment = {
  status: 'in_transit', carrier: 'Royal Mail', trackingNumber: 'RM123456789GB', trackingUrl: 'https://track.example/RM123456789GB',
  trackingStatusDescription: 'Arrived at the Leeds delivery office', shippedAt: iso('2026-07-06T08:00:00Z'), deliveredAt: null,
};
const GATEWAY = { paymentId: 410, method: 'northpay', kind: 'gateway' as const, status: 'pending', checkoutUrl: 'https://pay.example/s/410', canChange: true };
const order = (o: Partial<PublicOrder>): PublicOrder => ({ ...BASE, ...o });

const OWED = order({ payment: canPay() });
const SHIPPED = order({ status: 'shipped', shipments: [PARCEL] });
const NOTHING = order({ status: 'confirmed' });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-07-07T12:00:00Z'));
  localStorage.clear();
  state.fetches = 0;
  state.settings = {
    currency: 'GBP', enabled: true, supportLinks: [], notices: [], features: {},
    brand: { name: 'Northbound Supply', shortName: 'Northbound', title: 'Northbound Supply', tagline: null, links: { whatsapp: 'https://wa.me/447700900000', telegram: 'https://t.me/northbound_bot' } },
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

// ----------------------------------------------------------------- builders

const ROOT = { title: '', description: '', chrome: 'none' as const };
const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const p = (type: string, container = 'os'): ComponentData => part(type, container);
const rich = (id = 'rt', html = '<p>between</p>'): ComponentData => c('RichText', id, { bodyHtml: html, width: 'narrow' });
type Slots = Partial<Record<'top' | 'action' | 'summary' | 'bottom', ComponentData[]>>;
const DEFAULTS = (id = 'os'): Record<string, ComponentData[]> => ORDER_STATUS_CONTAINER.defaultSlots({}, { layout: 'storefront', id });
const status = (slots: Slots = {}, id = 'os'): ComponentData => c('OrderStatus', id, { ...DEFAULTS(id), ...slots });
const docOf = (...content: ComponentData[]): PuckDoc => ({ root: { props: ROOT }, content, zones: {} });
const rules = (d: PuckDoc, layout: LayoutKind = 'storefront') => checkRules(d, 'order-status', layout).map((i) => i.rule);
const types = (items: unknown) => (items as ComponentData[]).map((x) => x.type);

async function settle(m: Mounted): Promise<string> {
  let prev = '';
  for (let i = 0; i < 80; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 15)); });
    const cur = m.container.innerHTML;
    if (cur !== '' && cur === prev) return cur;
    prev = cur;
  }
  throw new Error('never settled');
}
const mountStatus = async (o: PublicOrder, slots: Slots | null = null): Promise<Mounted> => {
  state.order = () => Promise.resolve(o);
  const m = slots ? mountDoc('order-status', 'storefront', [status(slots)], { path: PATH, route: ROUTE, root: { chrome: 'none' } })
    : mountDefault('order-status', 'storefront', { path: PATH, route: ROUTE });
  await settle(m);
  return m;
};
const q = (m: Mounted, cls: string) => m.container.querySelector(`.${cls}`);
const sels = (m: Mounted) => ({ page: !!q(m, classes.pageWide!), layout: !!q(m, classes.layoutWide!) });

// ----------------------------------------------------------------- contract

describe('contract', () => {
  it.each(NAMES)('%s: family, style row, text keys', (name) => {
    const def = BLOCKS[name]!;
    const row = STAGE5_PARTS[name]!;
    expect(def.part).toEqual({ family: 'order-status' });
    expect(def.category).toBe('part');
    expect(def.slots).toEqual([]);
    expect(def.style && def.style.target).toBe(row.style.target);
    expect([...(def.style ? def.style.keys : [])].sort()).toEqual([...row.style.keys].sort());
    expect((def.text ?? []).length).toBeGreaterThan(0);
    // Every listed key is an exact key or an `area.part.*` pattern that matches at least one real key.
    for (const k of def.text ?? []) {
      expect(k.includes('*') ? /^[a-z.]+\.\*$/i.test(k) : isTextKey(k), k).toBe(true);
      expect(Object.keys(TEXT).some((key) => matchesTextPattern(key, k)), k).toBe(true);
    }
  });
  it('the labels', () => {
    expect(NAMES.map((n) => BLOCKS[n]!.label)).toEqual(['Order status', 'Payment', 'Tracking', 'Order items', 'Shipping address', 'Order reference']);
  });
  it('required parts have no hide; OrderStatusAddress keeps it', () => {
    for (const r of REQUIRED) expect(BLOCKS[r]!.style && BLOCKS[r]!.style.keys, r).not.toContain('hide');
    expect(BLOCKS.OrderStatusAddress!.style && BLOCKS.OrderStatusAddress!.style.keys).toContain('hide');
    expect(ORDER_STATUS_CONTAINER.required).toEqual(REQUIRED);
    expect(ORDER_STATUS_CONTAINER.noHide).toEqual([]);
  });
  it('the container: slots, style, text, spec', () => {
    const def = BLOCKS.OrderStatus!;
    expect(def.slots).toEqual(['top', 'action', 'summary', 'bottom']);
    expect(def.container).toBe(ORDER_STATUS_CONTAINER);
    expect(def.style && def.style.target).toBe('wrap');
    expect([...(def.style ? def.style.keys : [])].sort()).toEqual([...BOX].sort());
    expect(def.text).toEqual(['order.documentTitle', 'order.screens.*', 'order.link.*', 'common.actions.tryAgain', 'common.contact.*']);
    expect(ORDER_STATUS_CONTAINER.family).toBe('order-status');
    expect(ORDER_STATUS_CONTAINER.insertSlot).toBe('summary');
    expect(ORDER_STATUS_CONTAINER.contentOnly).toBe(true);
  });
  it('the text-bearing rows of the style table are what the parts declare', () => {
    expect([...STAGE5_PARTS.OrderStatusHero!.style.keys].sort()).toEqual([...BOX, ...TEXT_KEYS].sort());
    expect([...STAGE5_PARTS.OrderStatusAddress!.style.keys].sort()).toEqual([...BOX, ...TEXT_KEYS, ...VIS].sort());
  });
  it.each(['storefront', 'menu', 'webapp'] as const)('%s: defaults pass the rules, ids are unique and short', (layout) => {
    const id = 'OrderStatus-default';
    const item = c('OrderStatus', id, ORDER_STATUS_CONTAINER.defaultSlots({}, { layout, id }));
    expect(checkRules(docOf(item), 'order-status', layout)).toEqual([]);
    const ids = JSON.stringify(item).match(/"id":"([^"]+)"/g)!.map((s) => s.slice(6, -1));
    expect(ids.every((i) => i.length <= 64)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const long = 'x'.repeat(64);
    const idsLong = JSON.stringify(c('OrderStatus', long, ORDER_STATUS_CONTAINER.defaultSlots({}, { layout, id: long }))).match(/"id":"([^"]+)"/g)!.map((s) => s.slice(6, -1));
    expect(idsLong.every((i) => i.length <= 64)).toBe(true);
    expect(new Set(idsLong).size).toBe(idsLong.length);
  });
  it('the default arrangement', () => {
    const d = ORDER_STATUS_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'os' });
    expect(types(d.top)).toEqual(['OrderStatusHero']);
    expect(types(d.action)).toEqual(['OrderStatusPayment', 'OrderStatusShipments']);
    expect(types(d.summary)).toEqual(['OrderStatusItems', 'OrderStatusAddress']);
    expect(types(d.bottom)).toEqual(['OrderStatusFooter']);
    expect((d.top![0]!.props as { id: string }).id).toBe(partId('os', 'OrderStatusHero'));
  });
  it('a part outside its container renders nothing and does not throw', () => {
    for (const name of NAMES) {
      const view = BLOCKS[name]!.render({ id: 'x', puck: { editing: false, docKey: 'order-status', layout: 'storefront' } } as never);
      const { container, unmount } = render(<>{view}</>);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });
  it('the container spec is the one the plan fixes (type-checked)', () => {
    const spec: ContainerSpec = ORDER_STATUS_CONTAINER;
    expect(Object.keys(spec.homes!).sort()).toEqual([...NAMES].sort());
  });
});

// -------------------------------------------------------------------- rules

describe('rules', () => {
  it('the default document and every default layout are clean', () => {
    for (const layout of ['storefront', 'menu', 'webapp'] as const) expect(checkRules(defaultDoc('order-status', layout)!, 'order-status', layout)).toEqual([]);
  });
  it.each(REQUIRED)('removing %s => part-required', (name) => {
    const slots = DEFAULTS();
    for (const k of Object.keys(slots)) slots[k] = slots[k]!.filter((x) => x.type !== name);
    expect(rules(docOf(c('OrderStatus', 'os', slots)))).toContain(`part-required:OrderStatus.${name}`);
  });
  it('removing the optional OrderStatusAddress is fine', () => {
    expect(rules(docOf(status({ summary: [p('OrderStatusItems')] })))).toEqual([]);
  });
  it('duplicating a part => part-required (required) / part-unique (Address)', () => {
    expect(rules(docOf(status({ summary: [p('OrderStatusItems'), p('OrderStatusAddress'), c('OrderStatusItems', 'dup')] })))).toContain('part-required:OrderStatus.OrderStatusItems');
    expect(rules(docOf(status({ summary: [p('OrderStatusItems'), p('OrderStatusAddress'), c('OrderStatusAddress', 'dup')] })))).toContain('part-unique:OrderStatus.OrderStatusAddress');
  });
  it('part-home: each part has a fixed home', () => {
    expect(rules(docOf(status({ top: [p('OrderStatusHero'), c('OrderStatusFooter', 'x')], bottom: [] })))).toContain('part-home:OrderStatusFooter');
    expect(rules(docOf(status({ top: [], summary: [p('OrderStatusItems'), p('OrderStatusAddress'), c('OrderStatusHero', 'x')] })))).toContain('part-home:OrderStatusHero');
    expect(rules(docOf(status({ action: [p('OrderStatusShipments')], summary: [p('OrderStatusItems'), p('OrderStatusAddress'), c('OrderStatusPayment', 'x')] })))).toContain('part-home:OrderStatusPayment');
    expect(rules(docOf(status({ action: [p('OrderStatusPayment'), p('OrderStatusShipments'), c('OrderStatusFooter', 'x')], bottom: [] })))).toContain('part-home:OrderStatusFooter');
    expect(rules(docOf(status({ top: [p('OrderStatusHero'), c('OrderStatusItems', 'x')], summary: [p('OrderStatusAddress')] })))).toContain('part-home:OrderStatusItems');
  });
  it('content blocks go anywhere; a non-content block does not', () => {
    for (const slot of ['top', 'action', 'summary', 'bottom'] as const) {
      const d = DEFAULTS();
      expect(rules(docOf(status({ [slot]: [...d[slot]!, rich()] })))).toEqual([]);
    }
    const bad = DEFAULTS();
    expect(rules(docOf(status({ summary: [...bad.summary!, c('FeaturedProducts', 'fp')] })))).toContain('slot-accepts:OrderStatus.summary');
  });
  it('part-order: Items / Address / Shipments before Payment in action fail', () => {
    for (const early of ['OrderStatusShipments', 'OrderStatusItems', 'OrderStatusAddress']) {
      const d = DEFAULTS();
      const summary = d.summary!.filter((x) => x.type !== early);
      const action = early === 'OrderStatusShipments' ? [p(early), p('OrderStatusPayment')] : [c(early, 'moved'), p('OrderStatusPayment'), p('OrderStatusShipments')];
      const sum = early === 'OrderStatusShipments' ? d.summary! : summary;
      expect(rules(docOf(status({ action, summary: sum }))), early).toContain('part-order:OrderStatus');
    }
  });
  it('part-order sees through a Section that precedes Payment', () => {
    const section = c('Section', 'sec', { content: [c('OrderStatusItems', 'moved')] });
    expect(rules(docOf(status({ action: [section, p('OrderStatusPayment'), p('OrderStatusShipments')], summary: [p('OrderStatusAddress')] })))).toContain('part-order:OrderStatus');
  });
  it('part-order passes: a RichText before Payment; Items in summary with Payment second in action', () => {
    expect(rules(docOf(status({ action: [rich(), p('OrderStatusPayment'), p('OrderStatusShipments')] })))).toEqual([]);
    expect(rules(docOf(status({ action: [rich(), p('OrderStatusPayment'), p('OrderStatusShipments')], summary: [p('OrderStatusItems'), p('OrderStatusAddress')] })))).toEqual([]);
  });
  it('Payment after Shipments in action fails; Shipments after Payment is fine, Items after Payment is fine', () => {
    expect(rules(docOf(status({ action: [p('OrderStatusShipments'), p('OrderStatusPayment')] })))).toContain('part-order:OrderStatus');
    expect(rules(docOf(status({ action: [p('OrderStatusPayment'), c('OrderStatusItems', 'moved'), p('OrderStatusShipments')], summary: [p('OrderStatusAddress')] })))).toEqual([]);
  });
  it('hidden-required: a hidden Section holding Payment / Items / Hero fails, holding Address passes', () => {
    const hidden = (child: ComponentData) => c('Section', 'hs', { content: [child], blockStyle: { hide: 'mobile' } });
    const without = (type: string) => {
      const d = DEFAULTS();
      for (const k of Object.keys(d)) d[k] = d[k]!.filter((x) => x.type !== type);
      return d;
    };
    const arrange = (type: string, slot: 'top' | 'action' | 'summary') => {
      const d = without(type);
      return docOf(c('OrderStatus', 'os', { ...d, [slot]: [...d[slot]!, hidden(c(type, `${type}-h`))] }));
    };
    expect(rules(arrange('OrderStatusItems', 'summary'))).toContain('hidden-required:Section');
    expect(rules(arrange('OrderStatusHero', 'top'))).toContain('hidden-required:Section');
    // Payment must stay first in `action`: a hidden Section after Shipments is also an order problem, which is fine here.
    expect(rules(arrange('OrderStatusPayment', 'action'))).toContain('hidden-required:Section');
    expect(rules(arrange('OrderStatusAddress', 'summary'))).not.toContain('hidden-required:Section');
  });
});

// ------------------------------------------------------------------ upgrade

describe('upgrade of stored v0.7.0 documents', () => {
  const stored = (props: Record<string, unknown> = {}) => docOf(c('OrderStatus', 'OrderStatus-1', props));
  it('a stored { id } fills every slot from the defaults; present [] is untouched; idempotent', () => {
    const up = upgradeDoc(stored(), 'order-status', 'storefront');
    const item = up.content[0]!;
    expect(item.props).toEqual({ id: 'OrderStatus-1', ...ORDER_STATUS_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'OrderStatus-1' }) });
    const kept = upgradeDoc(stored({ top: [], action: [], summary: [], bottom: [] }), 'order-status', 'storefront').content[0]!;
    expect(kept.props).toEqual({ id: 'OrderStatus-1', top: [], action: [], summary: [], bottom: [] });
    expect(upgradeDoc(up, 'order-status', 'storefront')).toBe(up);
  });
  it('a present slot keeps its content while absent ones fill', () => {
    const up = upgradeDoc(stored({ bottom: [] }), 'order-status', 'storefront').content[0]!;
    expect(up.props.bottom).toEqual([]);
    expect(types(up.props.top)).toEqual(['OrderStatusHero']);
  });
  it('a stored blockStyle on the monolith survives the guard', () => {
    const r = validateDoc(stored({ blockStyle: { padTop: 'md' } }), 'order-status', 'storefront');
    expect(r.doc).not.toBeNull();
    const item = r.doc!.content[0]!;
    expect(item.props.blockStyle).toEqual({ padTop: 'md' });
    expect(types(item.props.action)).toEqual(['OrderStatusPayment', 'OrderStatusShipments']);
    expect(r.issues.filter((i) => !i.rule.startsWith('drop:'))).toEqual([]);
  });
});

// ------------------------------------------------------------- wide / narrow

describe('wide only when both columns show something', () => {
  it('default arrangement: payment owed => wide', async () => {
    expect(sels(await mountStatus(OWED))).toEqual({ page: true, layout: true });
  });
  it('payment not owed but shipments => wide (via Shipments)', async () => {
    expect(sels(await mountStatus(SHIPPED))).toEqual({ page: true, layout: true });
  });
  it('nothing owed and no shipments => narrow, with both column elements still present', async () => {
    const m = await mountStatus(NOTHING);
    expect(sels(m)).toEqual({ page: false, layout: false });
    const cols = [...m.container.querySelectorAll(`.${classes.layout} > .${classes.column}`)];
    expect(cols).toHaveLength(2);
    expect(cols[0]!.children).toHaveLength(0);
    expect(cols[1]!.children.length).toBeGreaterThan(0);
  });
  it('a cancelled crypto payment alone => narrow', async () => {
    const m = await mountStatus(order({ payment: { canPay: false, payBy: null, activePayment: null }, cryptoPayments: [{ ...CRYPTO, paymentStatus: 'cancelled' }] }));
    expect(sels(m)).toEqual({ page: false, layout: false });
  });
  it('Items moved into action after Payment, summary holding only an absent Address => narrow', async () => {
    const m = await mountStatus(order({ status: 'confirmed', shippingAddress: null, shipments: [PARCEL] }), {
      action: [p('OrderStatusPayment'), p('OrderStatusShipments'), c('OrderStatusItems', 'os-OrderStatusItems')], summary: [p('OrderStatusAddress')],
    });
    expect(sels(m)).toEqual({ page: false, layout: false });
    expect(m.container.textContent).toContain('Trail Mix 500g');
  });
  it('a Section wrapping only silent parts does not count as showing => narrow', async () => {
    const section = c('Section', 'sec-silent', { content: [p('OrderStatusPayment'), p('OrderStatusShipments')] });
    const m = await mountStatus(NOTHING, { action: [section] });
    expect(sels(m)).toEqual({ page: false, layout: false });
  });
  it('a Section holding a silent part and a RichText still shows => wide', async () => {
    const section = c('Section', 'sec-mixed', { content: [p('OrderStatusPayment'), p('OrderStatusShipments'), rich('rt-mixed')] });
    const m = await mountStatus(NOTHING, { action: [section] });
    expect(sels(m)).toEqual({ page: true, layout: true });
  });
  it('a RichText in summary makes it show', async () => {
    const m = await mountStatus(order({ status: 'confirmed', shippingAddress: null, shipments: [PARCEL] }), {
      action: [p('OrderStatusPayment'), p('OrderStatusShipments'), c('OrderStatusItems', 'os-OrderStatusItems')], summary: [p('OrderStatusAddress'), rich('rt-sum', '<p>Free returns</p>')],
    });
    expect(sels(m)).toEqual({ page: true, layout: true });
  });
});

// -------------------------------------------------------------- arrangement

describe('arrangement', () => {
  it('Items before Shipments in action (after Payment) renders in that DOM order', async () => {
    const m = await mountStatus(order({ status: 'shipped', shipments: [PARCEL], payment: canPay() }), {
      action: [p('OrderStatusPayment'), c('OrderStatusItems', 'os-moved'), p('OrderStatusShipments')], summary: [p('OrderStatusAddress')],
    });
    const col = m.container.querySelectorAll(`.${classes.column}`)[0]!;
    const text = col.textContent!;
    expect(text.indexOf('Trail Mix 500g')).toBeGreaterThan(-1);
    expect(text.indexOf('Trail Mix 500g')).toBeLessThan(text.indexOf('RM123456789GB'));
    expect(text.indexOf('NorthPay')).toBeLessThan(text.indexOf('Trail Mix 500g'));
  });
  it('a RichText between Payment and Items; Address removed', async () => {
    const m = await mountStatus(order({ payment: canPay() }), {
      action: [p('OrderStatusPayment'), rich('rt-mid', '<p>Questions? Message us.</p>'), p('OrderStatusShipments')], summary: [p('OrderStatusItems')],
    });
    const text = m.container.textContent!;
    expect(text).toContain('Questions? Message us.');
    expect(text).not.toContain('12 Quay Street');
    const cols = m.container.querySelectorAll(`.${classes.column}`);
    expect(cols[0]!.textContent).toContain('Questions? Message us.');
  });
  it('action precedes summary in the DOM; hero once, footer last', async () => {
    const m = await mountStatus(SHIPPED);
    const page = q(m, classes.page!)!;
    const kids = [...page.children];
    expect(kids[0]!.tagName).toBe('SECTION');
    expect(kids[1]!.className).toContain('layout');
    expect(kids[2]!.tagName).toBe('FOOTER');
    expect([...kids[1]!.children].map((x) => x.className.split(' ')[0]!.includes('column'))).toEqual([true, true]);
    expect(m.container.querySelectorAll('h1')).toHaveLength(1);
  });
  it('a custom arrangement still sets the document title', async () => {
    await mountStatus(OWED, { top: [p('OrderStatusHero')], action: [rich('r1'), p('OrderStatusPayment'), p('OrderStatusShipments')] });
    expect(document.title).toContain('NB0977');
  });
  it('the three screens still render before any slot', async () => {
    state.order = () => new Promise(() => {});
    const m = mountDoc('order-status', 'storefront', [status({ top: [p('OrderStatusHero'), rich('only-rich', '<p>never shown</p>')] })], { path: PATH, route: ROUTE, root: { chrome: 'none' } });
    await settle(m);
    expect(m.container.textContent).not.toContain('never shown');
    cleanup();
    const bad = mountDoc('order-status', 'storefront', [status({ top: [p('OrderStatusHero'), rich('only-rich', '<p>never shown</p>')] })], { path: '/order', route: '/order' });
    await settle(bad);
    expect(bad.container.textContent).not.toContain('never shown');
  });
  it('a pre-v0.7 order (no payment block) with crypto draws the crypto cards only', async () => {
    const o = order({ cryptoPayments: [CRYPTO] });
    delete o.payment;
    const m = await mountStatus(o);
    expect(m.container.textContent).toContain(CRYPTO.address);
    expect(m.container.querySelector('button[aria-expanded]')).toBeNull();
    expect(sels(m)).toEqual({ page: true, layout: true });
  });
});

// --------------------------------------------------------- payment coupling

describe('payment coupling', () => {
  it('with the change-method panel open the hosted card and the active crypto card are hidden, Payment first and a RichText before it', async () => {
    const o = order({ payment: canPay({ activePayment: GATEWAY }), cryptoPayments: [CRYPTO] });
    const slots: Slots = { action: [rich('before-pay', '<p>Before paying</p>'), p('OrderStatusPayment'), p('OrderStatusShipments')] };
    const m = await mountStatus(o, slots);
    expect(m.container.textContent).toContain(CRYPTO.address);
    expect(m.container.querySelector('a[href="https://pay.example/s/410"]')).not.toBeNull();
    await act(async () => { fireEvent.click(m.container.querySelector('button[aria-expanded="false"]')!); });
    await settle(m);
    expect(m.container.querySelector('a[href="https://pay.example/s/410"]')).toBeNull();
    expect(m.container.textContent).not.toContain(CRYPTO.address);
    expect(m.container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    expect(m.container.textContent).toContain('Before paying');
  });
});

// ------------------------------------------------------------ preview fixture

describe('preview fixture', () => {
  const inEditor = (fixture: unknown) => mountAt(
    <BuilderModeProvider value={{ editing: true, previewAs: null, previewFixtures: fixture ? { OrderStatus: fixture } : {} }}>
      <OrderStatusPage />
    </BuilderModeProvider>,
    { path: '/', route: '*' },
  );
  it('a fixture renders without fetching, without route params and without remembering the order', async () => {
    state.order = () => Promise.resolve(NOTHING);
    const m = inEditor(order({ payment: canPay() }));
    await settle(m);
    expect(state.fetches).toBe(0);
    expect(m.container.textContent).toContain('Choose how to pay');
    expect(localStorage.length).toBe(0);
  });
  it('without a fixture the query path runs', async () => {
    state.order = () => Promise.resolve(OWED);
    const m = mountAt(<OrderStatusPage />, { path: PATH, route: ROUTE });
    await settle(m);
    expect(state.fetches).toBe(1);
    expect(m.container.textContent).toContain('Choose how to pay');
  });
  it('a fixture-free preview provider on a link with no parameters still shows the invalid-link screen', async () => {
    const m = inEditor(null);
    await settle(m);
    expect(state.fetches).toBe(0);
    expect(m.container.textContent).not.toContain('Trail Mix');
  });
});

// -------------------------------------------------------------------- style

describe('style', () => {
  const styled = (type: string, id: string) => ({ ...c(type, id), props: { id, blockStyle: { padTop: 'md' } } });
  it('a styled Payment part wraps its cards in one element; unstyled adds none', async () => {
    const plain = await mountStatus(order({ payment: canPay({ activePayment: GATEWAY }), cryptoPayments: [CRYPTO] }));
    expect(plain.container.querySelector('[data-sf-style="OrderStatusPayment"]')).toBeNull();
    cleanup();
    const d = DEFAULTS();
    const m = await mountStatus(order({ payment: canPay({ activePayment: GATEWAY }), cryptoPayments: [CRYPTO] }), {
      action: [styled('OrderStatusPayment', 'os-pay'), d.action![1]!],
    });
    const wrap = m.container.querySelectorAll('[data-sf-style="OrderStatusPayment"]');
    expect(wrap).toHaveLength(1);
    expect(wrap[0]!.parentElement!.className).toContain('column');
    expect(wrap[0]!.querySelectorAll('[data-sf-part="card"]').length).toBeGreaterThanOrEqual(2);
  });
  it('root parts carry the style attributes on their own element', async () => {
    const d = DEFAULTS();
    const m = await mountStatus(SHIPPED, {
      top: [styled('OrderStatusHero', 'os-h')], summary: [styled('OrderStatusItems', 'os-i'), styled('OrderStatusAddress', 'os-a')], bottom: [styled('OrderStatusFooter', 'os-f')], action: d.action!,
    });
    expect(m.container.querySelector('section[data-sf-style="OrderStatusHero"]')).not.toBeNull();
    expect(m.container.querySelector('section[data-sf-style="OrderStatusItems"][data-sf-part="card"]')).not.toBeNull();
    expect(m.container.querySelector('section[data-sf-style="OrderStatusAddress"][data-sf-part="card"]')).not.toBeNull();
    expect(m.container.querySelector('footer[data-sf-style="OrderStatusFooter"]')).not.toBeNull();
  });
  it('unstyled root parts carry no style attribute at all', async () => {
    const m = await mountStatus(SHIPPED);
    expect(m.container.querySelector('[data-sf-style]')).toBeNull();
  });
  it('the CSS module reads --sf-block-fg / --sf-text-scale on the text rules, and the wrap parts have a column rule', () => {
    const css = readFileSync(resolve(__dirname, '../src/features/order-status/OrderStatus.module.css'), 'utf8').replace(/\r\n/g, '\n');
    const rule = (sel: string) => {
      const i = css.indexOf(`\n${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i));
    };
    for (const sel of ['.eyebrow', '.headline', '.detail', '.meta', '.cardEyebrow', '.itemName', '.itemQty', '.itemTotal', '.rowLabel', '.rowFigure', '.addressName', '.addressLine']) {
      const r = rule(sel);
      expect(r, sel).toContain('var(--sf-block-fg, ');
      expect(r, sel).toMatch(/font-size: calc\([^;]*\* var\(--sf-text-scale, 1\)\)/);
    }
    for (const tone of ['success', 'danger', 'muted']) expect(rule(`.eyebrow[data-tone='${tone}']`)).toContain('var(--sf-block-fg, ');
    expect(rule('.grandFigure')).toMatch(/font-size: calc\(1\.25rem \* var\(--sf-text-scale, 1\)\)/);
    expect(css).toMatch(/\.column > \[data-sf-style='OrderStatusPayment'\],\n\.column > \[data-sf-style='OrderStatusShipments'\] \{\n  display: grid;\n  gap: 0\.9rem;/);
  });
});
