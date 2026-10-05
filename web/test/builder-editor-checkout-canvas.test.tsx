import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useEffect, useImperativeHandle, useState, type ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Quote } from '@/types/checkout.ts';

// Pinned like the goldens: the dates the order fixtures format read the same everywhere.
vi.hoisted(() => { process.env.TZ = 'Europe/London'; });

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, readOnly: false }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/lib/telegram-webapp.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram-webapp.ts')>()),
  isTelegramWebApp: () => false,
  openExternalLink: () => {},
}));
vi.mock('@/api/checkout.ts', () => ({ quote: vi.fn(), guestQuote: vi.fn(), placeOrder: vi.fn(), placeGuestOrder: vi.fn() }));
vi.mock('@/features/cart/useServerCart.ts', () => ({
  useServerCart: () => ({ mode: 'server', isSyncing: false, issues: [], add: vi.fn(), setQuantity: vi.fn(), remove: vi.fn(), sync: async () => {}, refresh: async () => {} }),
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('@/templates/runtime.tsx', async (orig) => ({ ...(await orig<typeof import('@/templates/runtime.tsx')>()), Slot: () => null }));

const turnstile = vi.hoisted(() => ({ minted: 0 }));
vi.mock('@marsidev/react-turnstile', async () => ({
  Turnstile: forwardRef<unknown, { onSuccess?: (token: string) => void; onWidgetLoad?: (id: string) => void }>(function TurnstileStub(props, ref) {
    useImperativeHandle(ref, () => ({
      execute: () => { turnstile.minted += 1; props.onSuccess?.(`tok-${turnstile.minted}`); },
      reset: () => {}, remove: () => {}, render: () => {}, getResponse: () => undefined,
    }));
    useEffect(() => { props.onWidgetLoad?.('stub'); // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="turnstile" />;
  }),
}));
// CheckoutNote reads only `readOnly`; the rest of the store is the real one.
vi.mock('@/builder/editor/store.ts', async (orig) => {
  const real = await orig<typeof import('@/builder/editor/store.ts')>();
  const useEditorStore = ((sel: (s: unknown) => unknown) => sel({ readOnly: state.readOnly })) as unknown as typeof real.useEditorStore;
  return { ...real, useEditorStore };
});

import { guestQuote, placeGuestOrder, placeOrder, quote } from '@/api/checkout.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { DEFAULT_FORM, persistForm, type CheckoutForm } from '@/features/checkout/form-state.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { BuilderModeProvider, useBuilderMode, type BuilderMode } from '@/builder/mode.ts';
import { CHECKOUT_CONTAINER } from '@/builder/blocks/_shared/checkout-container.ts';
import { STEP_TYPE, type CheckoutSlots, type StepKind } from '@/builder/family-checkout.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';
import { effectivePreviewAs } from '@/builder/editor/fixture-mode.ts';
import { fixtureOrderDetails, fixtureOrderStates } from '@/builder/editor/fixtures.ts';
import { CheckoutNote } from '@/builder/editor/CheckoutNote.tsx';
import { CheckoutPage } from '@/features/checkout/CheckoutPage.tsx';
import { mountAt } from './helpers/stage4-golden.tsx';

const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const docOf = (...content: ComponentData[]): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content, zones: {} });
const defaults = () => CHECKOUT_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'cf' });
const stepItems = (kinds: readonly StepKind[]): ComponentData[] => {
  const all = defaults().steps!;
  return kinds.map((k) => all.find((s) => s.type === STEP_TYPE[k])!);
};
const withSlot = (items: ComponentData[], type: string, slot: 'before' | 'after', value: ComponentData[]) =>
  items.map((s) => (s.type === type ? { ...s, props: { ...s.props, [slot]: value } } : s));
const rich = (id: string, html: string) => c('RichText', id, { bodyHtml: html, width: 'narrow' });

const line = (): LocalLine => ({ productId: 12, displayName: 'Widget Blue', sku: 'WID-BLU', unitPrice: 40, basePrice: 40, pricingTiers: [], quantity: 2, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null });
const makeQuote = (): Quote => ({
  items: [{ productId: 12, name: 'Widget Blue', sku: 'WID-BLU', quantity: 2, unitPrice: 40, lineTotal: 80, tierApplied: false, isPreorder: false }],
  subtotal: 80, coupon: null,
  shippingOptions: [{ id: 3, name: 'Royal Mail Tracked 24', courier: 'Royal Mail', price: 4.99, freeShipping: false }],
  selectedShippingOptionId: null, shippingAmount: 0, storeCredit: { balance: 0, applied: 0, remaining: 0 }, grandTotal: 80, amountDue: 80,
  paymentMethods: [{ slot: 'card', method: 'stripe', displayName: 'Card', type: 'gateway', details: null, feeType: 'percentage', feeValue: 2, feeRateText: '+2%', feeLabel: 'Card fee', fee: 1.6, chargeTotal: 81.6 }],
  contactModes: { emailMode: 'required', phoneMode: 'optional', defaultPhoneCountry: 'GB' },
});
const settings = (guest: boolean): StorefrontSettings => ({
  currency: 'GBP', contactModes: { emailMode: 'required', phoneMode: 'optional', defaultPhoneCountry: 'GB' },
  features: { layout: 'storefront', ordering: true, guestCheckout: guest, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  turnstile: guest ? { siteKey: '1x00000000000000000000AA' } : null,
  brand: { name: 'Northbound Supply', shortName: 'Northbound', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
  supportLinks: [], notices: [], enabled: true,
}) as unknown as StorefrontSettings;
const form = (over: Partial<CheckoutForm> = {}): CheckoutForm => ({
  ...DEFAULT_FORM, firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com', phonePrefix: 'GB',
  addressLine1: '1 Main St', city: 'London', zip: 'SW1A 1AA', country: 'GB', shippingOptionId: 3, paymentMethod: 'stripe', ...over,
});

function prepare(guest = false) {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  turnstile.minted = 0;
  state.readOnly = false;
  state.settings = settings(guest);
  useCartStore.setState({ lines: [line()], mode: guest ? 'local' : 'server' });
  useSessionStore.setState(guest ? { token: null, customer: null, returnTo: null } : { token: 'sess-1', customer: { id: 5, nickname: 'ada' }, returnTo: null });
  vi.mocked(quote).mockImplementation(() => Promise.resolve(makeQuote()));
  vi.mocked(guestQuote).mockImplementation(() => Promise.resolve(makeQuote()));
  persistForm(form());
}
beforeEach(() => prepare());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  useSessionStore.setState({ token: null, customer: null, returnTo: null });
  useCartStore.setState({ lines: [], mode: 'local' });
});

const EDITING: BuilderMode = { editing: true, previewAs: { session: 'signed-in', cart: 'items' }, previewStates: {}, previewFixtures: {} };
const EXACT: BuilderMode = { ...EDITING, editing: false };

function mount(doc: PuckDoc, mode: BuilderMode | null) {
  const guarded = validateDoc(doc, 'checkout', 'storefront');
  if (!guarded.doc) throw new Error(JSON.stringify(guarded.issues));
  const ui: ReactNode = <RenderDoc doc={guarded.doc} docKey="checkout" layout="storefront" />;
  return mountAt(mode ? <BuilderModeProvider value={mode}>{ui}</BuilderModeProvider> : ui, { path: '/checkout', route: '/checkout' });
}
const flowDoc = (over: Record<string, ComponentData[]> = {}) => docOf(c('CheckoutFlow', 'cf', { ...defaults(), ...over }));
const framed = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[data-sf-part="card"]')).filter((el) => el.querySelector('header'));
const T = 30_000;
const norm = (html: string) => html.replace(/_r_[a-z0-9]+_/g, 'RID').replace(/:r[a-z0-9]+:/g, 'RID');

describe('stacked checkout canvas', () => {
  it('shows five step cards in the owner order, each with its count and title, and slot content inside each step', async () => {
    const order: StepKind[] = ['address', 'contact', 'shipping', 'payment', 'review'];
    let steps = stepItems(order);
    steps = withSlot(steps, 'CheckoutAddress', 'before', [rich('b1', '<p>Before address</p>')]);
    steps = withSlot(steps, 'CheckoutContact', 'after', [rich('a2', '<p>After contact</p>')]);
    const m = mount(flowDoc({ steps }), EDITING);
    await screen.findByText('Step 5 of 5');
    const cs = framed(m.container);
    expect(cs).toHaveLength(5);
    cs.forEach((el, i) => expect(el.querySelector('header span')!.textContent).toBe(`Step ${i + 1} of 5`));
    expect(cs[0]!.textContent).toContain('Before address');
    expect(cs[1]!.textContent).toContain('After contact');
    expect(cs[0]!.querySelector('h2')!.textContent).not.toBe(cs[1]!.querySelector('h2')!.textContent);
    // The shopper's single card wrapper is not mounted: only the five step frames carry the card part.
    expect(m.container.querySelectorAll('[data-sf-part="card"]')).toHaveLength(5);
  }, T);

  it('renders one inert action band after the last card, then the terms line, then the after slot; it does nothing', async () => {
    const m = mount(flowDoc({ after: [rich('tail', '<p>Tail note</p>')] }), EDITING);
    await screen.findByText('Step 5 of 5');
    const bands = Array.from(m.container.querySelectorAll<HTMLElement>('[inert]'));
    expect(bands).toHaveLength(1);
    const band = bands[0]!;
    expect(band.getAttribute('aria-hidden')).toBe('true');
    expect(Array.from(band.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Back', 'Continue', 'Place order']);
    const last = framed(m.container).at(-1)!;
    const terms = screen.getByText(/Placing the order confirms/);
    const tail = screen.getByText('Tail note');
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(last, band)).toBe(true);
    expect(follows(band, terms)).toBe(true);
    expect(follows(terms, tail)).toBe(true);
    for (const b of Array.from(band.querySelectorAll('button'))) fireEvent.click(b);
    expect(placeOrder).not.toHaveBeenCalled();
    expect(screen.getAllByText(/^Step \d of 5$/)).toHaveLength(5);
  }, T);

  it('mounts no alerts, no Turnstile and no verifying text, even for a guest with a pending quote', async () => {
    prepare(true);
    const m = mount(flowDoc(), EDITING);
    await screen.findByText('Step 5 of 5');
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    expect(screen.queryByTestId('turnstile')).toBeNull();
    expect(m.container.querySelector('[class*="alert"]')).toBeNull();
    expect(m.container.textContent).not.toMatch(/verifying/i);
    expect(turnstile.minted).toBe(0);
    expect(guestQuote).not.toHaveBeenCalled();
    expect(placeGuestOrder).not.toHaveBeenCalled();
  }, T);

  it('shoppers get no stack, and the exact preview (editing: false) renders the shopper DOM', async () => {
    const shopper = mount(flowDoc(), null);
    await screen.findByText('Step 1 of 5');
    expect(screen.queryByText('Step 2 of 5')).toBeNull();
    expect(shopper.container.querySelector('[inert]')).toBeNull();
    const shopperHtml = norm(shopper.container.innerHTML);
    cleanup();
    const exact = mount(flowDoc(), EXACT);
    await screen.findByText('Step 1 of 5');
    expect(norm(exact.container.innerHTML)).toBe(shopperHtml);
  }, T);
});

describe('illegal stored step order', () => {
  const slot = (types: string[]) => Object.assign(() => null, { items: types.map((type, i) => c(type, `s${i}`)) });
  const empty = () => Object.assign(() => null, { items: [] as ComponentData[] });
  const slots = (types: string[]): CheckoutSlots => ({ head: empty(), lead: empty(), steps: slot(types), after: empty(), aside: empty() } as unknown as CheckoutSlots);
  const ILLEGAL = ['CheckoutReview', 'CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment'];
  const LEGAL = ['CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview'];

  it('warns once, not per render, and falls back to the default order', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A fresh slots object on every render, so the order memo recomputes each time.
    function Twice() {
      const [n, setN] = useState(0);
      useEffect(() => { setN(1); }, []);
      return <>{n >= 0 ? <CheckoutPage slots={slots(ILLEGAL)} /> : null}</>;
    }
    mountAt(<Twice />, { path: '/checkout', route: '/checkout' });
    await screen.findByText('Step 1 of 5');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(warn.mock.calls.filter((a) => String(a[0]).includes('step order'))).toHaveLength(1);
  }, T);
  it('stays silent for a legal order and on the editor canvas', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountAt(<CheckoutPage slots={slots(LEGAL)} />, { path: '/checkout', route: '/checkout' });
    await screen.findByText('Step 1 of 5');
    cleanup();
    mountAt(<BuilderModeProvider value={EDITING}><CheckoutPage slots={slots(ILLEGAL)} /></BuilderModeProvider>, { path: '/checkout', route: '/checkout' });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(warn.mock.calls.filter((a) => String(a[0]).includes('step order'))).toHaveLength(0);
  }, T);
});

describe('effectivePreviewAs', () => {
  it('forces signed in with a cart on the checkout document only', () => {
    const p = { session: 'signed-out', cart: 'empty' } as const;
    expect(effectivePreviewAs('checkout', p)).toEqual({ session: 'signed-in', cart: 'items' });
    expect(effectivePreviewAs('cart', p)).toBe(p);
  });
});

describe('order state fixtures', () => {
  const ids = ['awaiting-payment', 'hosted-open', 'crypto-waiting', 'shipped', 'collection', 'cancelled'] as const;
  const states = fixtureOrderStates(new Date());
  const details = fixtureOrderDetails(new Date());
  it('has the six states, all for NB0977, each with an order and a payment view', () => {
    expect(Object.keys(states).sort()).toEqual([...ids].sort());
    expect(Object.keys(details).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(states[id].reference, id).toBe('NB0977');
      expect(details[id].reference, id).toBe('NB0977');
    }
  });
  it('each state carries what its variant needs', () => {
    const s = states;
    expect(s['awaiting-payment'].status).toBe('pending');
    expect(s['awaiting-payment'].payment).toMatchObject({ canPay: true, activePayment: null });
    expect(new Date(s['awaiting-payment'].payment!.payBy!).getTime()).toBeGreaterThan(Date.now());
    const hosted = s['hosted-open'].payment!.activePayment!;
    expect(hosted).toMatchObject({ kind: 'gateway', status: 'pending', canChange: true });
    expect(new URL(hosted.checkoutUrl!).host).toBe('shop.example');
    const crypto = s['crypto-waiting'];
    expect(crypto.cryptoPayments![0]).toMatchObject({ verificationStatus: 'pending', txidMasked: null });
    expect(crypto.payment!.activePayment).toMatchObject({ kind: 'crypto', canChange: true });
    expect(s.collection.shippingAddress!.servicePoint).toMatchObject({ carrier: 'DPD' });
    expect(details.collection.servicePoint).toMatchObject({ carrier: 'DPD' });
    expect(s.cancelled.status).toBe('cancelled');
    expect(s.cancelled.payment!.canPay).toBe(false);
    expect(s.shipped.payment!.canPay).toBe(false);
  });
  it('the order side agrees with the payment side: unpaid states owe money, paid ones owe none, cancelled keeps a balance it must not ask for', () => {
    for (const id of ['awaiting-payment', 'hosted-open', 'crypto-waiting'] as const) {
      expect(details[id], id).toMatchObject({ status: 'pending', outstandingBalance: 64.9, canCancel: true });
    }
    for (const id of ['shipped', 'collection'] as const) expect(details[id], id).toMatchObject({ outstandingBalance: 0, canCancel: false });
    expect(details.cancelled).toMatchObject({ status: 'cancelled', outstandingBalance: 64.9 });
  });
  it('invents everything: no email, and every URL is on shop.example', () => {
    for (const id of ids) {
      const json = JSON.stringify([states[id], details[id]]);
      expect(json, id).not.toContain('@');
      for (const url of json.match(/https?:\/\/[^"\s]+/g) ?? []) expect(new URL(url).host, `${id} ${url}`).toBe('shop.example');
    }
  });
  it('the pay-by date follows the clock it is given, three days out', () => {
    const now = new Date('2031-05-04T09:00:00.000Z');
    const payBy = fixtureOrderStates(now)['awaiting-payment'].payment!.payBy!;
    expect(new Date(payBy).getTime()).toBe(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  });
  it('a read-only / version mode carries no fixtures, so no container is in preview', () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useBuilderMode().previewFixtures ?? null);
      return null;
    }
    render(<BuilderModeProvider value={{ editing: false, previewAs: null, previewStates: null, previewFixtures: null }}><Probe /></BuilderModeProvider>);
    expect(seen).toEqual([null]);
  });
});

describe('CheckoutNote', () => {
  it('is a note with the sample-cart text, and absent in a read-only view', () => {
    render(<CheckoutNote />);
    expect(screen.getByRole('note').textContent).toBe('Checkout previews signed in with a sample cart.');
    cleanup();
    state.readOnly = true;
    render(<CheckoutNote />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
