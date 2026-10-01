import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Quote } from '@/types/checkout.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

const tg = vi.hoisted(() => ({ inTelegram: false }));
vi.mock('@/lib/telegram-webapp.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram-webapp.ts')>()),
  isTelegramWebApp: () => tg.inTelegram,
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

import { guestQuote, placeGuestOrder, placeOrder, quote } from '@/api/checkout.ts';
import { ApiError } from '@/lib/errors.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { usePrimaryActionStore } from '@/stores/primary-action.ts';
import { useSessionStore } from '@/stores/session.ts';
import { DEFAULT_FORM, persistForm, type CheckoutForm } from '@/features/checkout/form-state.ts';
import { checkRules, containsVisibleType } from '@/builder/rules.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { validateDoc } from '@/builder/guard.ts';
import { upgradeDoc, upgradeItems } from '@/builder/upgrade.ts';
import { prepareProps } from '@/builder/editor/prepare.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { partId } from '@/builder/parts.ts';
import { TEXT_ENTRIES } from '@/text/registry.ts';
import type { ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { CHECKOUT_CONTAINER, stepSlots } from '@/builder/blocks/_shared/checkout-container.ts';
import {
  DEFAULT_STEP_ORDER, STEP_KINDS, STEP_TYPE, isLegalStepOrder, stepKindsOf, stepOrderProblem, type StepKind,
} from '@/builder/family-checkout.ts';
import { STAGE5_PARTS } from './helpers/stage5-parts.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { mountAt, mountDoc } from './helpers/stage4-golden.tsx';
import stepCss from '@/features/checkout/steps/Steps.module.css';

const CHECKOUT_PARTS = ['CheckoutHeading', 'CheckoutProgress', 'CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview', 'CheckoutCoupon', 'CheckoutNotes', 'CheckoutSummary'];
const STEP_PARTS = ['CheckoutContact', 'CheckoutAddress', 'CheckoutShipping', 'CheckoutPayment', 'CheckoutReview'];
const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];

const ROOT = { title: '', description: '', chrome: 'shell' as const };
const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const docOf = (...content: ComponentData[]): PuckDoc => ({ root: { props: ROOT }, content, zones: {} });
const defaults = (layout: LayoutKind = 'storefront', id = 'cf') => CHECKOUT_CONTAINER.defaultSlots({}, { layout, id });
type Slots = Record<'head' | 'lead' | 'steps' | 'after' | 'aside', ComponentData[]>;
const flow = (over: Partial<Slots> = {}, id = 'cf'): ComponentData => c('CheckoutFlow', id, { ...defaults('storefront', id), ...over });
const rules = (d: PuckDoc, layout: LayoutKind = 'storefront') => checkRules(d, 'checkout', layout).map((i) => i.rule);
const types = (items: unknown) => (items as ComponentData[]).map((x) => x.type);
const stepItems = (kinds: readonly StepKind[], id = 'cf'): ComponentData[] => {
  const all = defaults('storefront', id).steps!;
  return kinds.map((k) => all.find((s) => s.type === STEP_TYPE[k])!);
};
const withSlot = (items: ComponentData[], type: string, slotName: 'before' | 'after', value: ComponentData[]): ComponentData[] =>
  items.map((s) => (s.type === type ? { ...s, props: { ...s.props, [slotName]: value } } : s));
const permutations = <T,>(xs: readonly T[]): T[][] => (xs.length <= 1 ? [[...xs]] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

describe('step order (pure)', () => {
  const LEGAL = ['contact,address,shipping,payment,review', 'address,contact,shipping,payment,review', 'address,shipping,contact,payment,review', 'address,shipping,payment,contact,review'];
  it('exactly four of the 120 permutations are legal', () => {
    const perms = permutations(STEP_KINDS);
    expect(perms).toHaveLength(120);
    const legal = perms.filter((p) => stepOrderProblem(p) === null).map((p) => p.join(','));
    expect(legal.sort()).toEqual([...LEGAL].sort());
    for (const p of perms) expect(isLegalStepOrder(p)).toBe(LEGAL.includes(p.join(',')));
  });
  it('reports the problems in precedence order', () => {
    expect(stepOrderProblem(['review', 'contact', 'address', 'shipping', 'payment'])).toBe('review-last');
    expect(stepOrderProblem(['shipping', 'address', 'contact', 'payment', 'review'])).toBe('address-first');
    expect(stepOrderProblem(['contact', 'address', 'payment', 'shipping', 'review'])).toBe('payment-last');
  });
  it('a four-element list is not legal; stepKindsOf ignores other types', () => {
    expect(isLegalStepOrder(['contact', 'address', 'shipping', 'payment'])).toBe(false);
    expect(stepKindsOf(['Section', 'CheckoutAddress', 'RichText', 'CheckoutContact'])).toEqual(['address', 'contact']);
    expect(DEFAULT_STEP_ORDER).toEqual(STEP_KINDS);
  });
});

describe('contract', () => {
  it.each(CHECKOUT_PARTS)('%s: family, style row, category', (name) => {
    const def = BLOCKS[name]!;
    const row = STAGE5_PARTS[name]!;
    expect(def.part?.family).toBe('checkout');
    expect(def.category).toBe('part');
    expect(def.style && def.style.target).toBe(row.style.target);
    expect([...(def.style ? def.style.keys : [])].sort()).toEqual([...row.style.keys].sort());
    expect((def.text ?? []).length).toBeGreaterThan(0);
  });
  it('no hide on required parts or on the coupon / notes; no textSize on a part holding an input', () => {
    for (const r of [...CHECKOUT_CONTAINER.required, 'CheckoutCoupon', 'CheckoutNotes']) expect(BLOCKS[r]!.style && BLOCKS[r]!.style.keys, r).not.toContain('hide');
    for (const n of [...STEP_PARTS, 'CheckoutCoupon', 'CheckoutNotes', 'CheckoutSummary']) expect(BLOCKS[n]!.style && BLOCKS[n]!.style.keys, n).not.toContain('textSize');
  });
  it('the five step parts own before / after slots and a defaultSlots hook', () => {
    for (const n of STEP_PARTS) {
      expect(BLOCKS[n]!.slots).toEqual(['before', 'after']);
      expect(BLOCKS[n]!.part?.defaultSlots).toBeTypeOf('function');
    }
    for (const n of CHECKOUT_PARTS.filter((x) => !STEP_PARTS.includes(x))) expect(BLOCKS[n]!.slots).toEqual([]);
  });
  it('every text entry is a valid pattern and an exact one names a real key', () => {
    for (const n of [...CHECKOUT_PARTS, 'CheckoutFlow']) {
      for (const pat of BLOCKS[n]!.text ?? []) {
        expect(pat, `${n}: ${pat}`).toMatch(/^[a-z][A-Za-z]*(\.[A-Za-z]+)*(\.\*)?$/);
        if (!pat.endsWith('.*')) expect(TEXT_ENTRIES[pat], `${n}: ${pat}`).toBeDefined();
      }
    }
  });
  it('the container: slots, style, container spec', () => {
    const cf = BLOCKS.CheckoutFlow!;
    expect(cf.slots).toEqual(['head', 'lead', 'steps', 'after', 'aside']);
    expect(cf.container).toBe(CHECKOUT_CONTAINER);
    expect(cf.style && cf.style.target).toBe('wrap');
  });
  it('a part outside its container renders nothing and does not throw', () => {
    for (const name of CHECKOUT_PARTS) {
      const view = BLOCKS[name]!.render({ id: 'x', before: () => null, after: () => null, puck: { editing: false, docKey: 'checkout', layout: 'storefront' } } as never);
      const { container, unmount } = render(<>{view}</>);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });
  it.each(LAYOUTS)('%s: defaults pass the rules; ids are unique and short', (layout) => {
    const id = 'CheckoutFlow-default';
    const item = c('CheckoutFlow', id, defaults(layout, id));
    expect(checkRules(docOf(item), 'checkout', layout)).toEqual([]);
    for (const useId of [id, 'x'.repeat(64)]) {
      const ids = JSON.stringify(c('CheckoutFlow', useId, defaults(layout, useId))).match(/"id":"([^"]+)"/g)!.map((s) => s.slice(6, -1));
      expect(ids.every((i) => i.length <= 64)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('stepSlots is the single source: upgrade of a step stored without slots gives the same ids', () => {
    for (const k of STEP_KINDS) {
      const sid = partId('cf', STEP_TYPE[k]);
      const up = upgradeItems([c(STEP_TYPE[k], sid)], 'storefront')[0]!;
      expect(up.props).toEqual({ id: sid, ...stepSlots(STEP_TYPE[k], sid) });
    }
  });
  it('the default document is the nested arrangement', () => {
    const d = defaultDoc('checkout', 'storefront')!;
    const cf = d.content[0]!;
    expect(types(cf.props.head)).toEqual(['CheckoutHeading']);
    expect(types(cf.props.lead)).toEqual(['CheckoutProgress']);
    expect(types(cf.props.steps)).toEqual(STEP_PARTS);
    expect(types(cf.props.aside)).toEqual(['CheckoutSummary']);
    const steps = cf.props.steps as ComponentData[];
    expect(types(steps[2]!.props.after)).toEqual(['CheckoutCoupon']);
    expect(types(steps[4]!.props.after)).toEqual(['CheckoutNotes']);
    expect(checkRules(d, 'checkout', 'storefront')).toEqual([]);
  });
});

describe('rules', () => {
  it.each(CHECKOUT_CONTAINER.required)('removing %s => part-required', (name) => {
    const slots = defaults();
    const stripped: Record<string, ComponentData[]> = {};
    for (const [k, items] of Object.entries(slots)) stripped[k] = items.filter((x) => x.type !== name);
    expect(rules(docOf(c('CheckoutFlow', 'cf', stripped)))).toContain(`part-required:CheckoutFlow.${name}`);
  });
  it('a duplicate CheckoutNotes => part-unique', () => {
    const steps = withSlot(stepItems(STEP_KINDS), 'CheckoutPayment', 'after', [c('CheckoutNotes', 'dup')]);
    expect(rules(docOf(flow({ steps })))).toContain('part-unique:CheckoutFlow.CheckoutNotes');
  });
  it('part-order is reported iff the stored order is illegal (all 120 permutations)', () => {
    for (const perm of permutations(STEP_KINDS)) {
      const found = rules(docOf(flow({ steps: stepItems(perm) }))).includes('part-order:CheckoutFlow');
      expect(found, perm.join(',')).toBe(!isLegalStepOrder(perm));
    }
  });
  it('part-home table', () => {
    const coupon = () => c('CheckoutCoupon', 'cpn');
    const at = (kind: StepKind, slotName: 'before' | 'after', items: ComponentData[]) =>
      docOf(flow({ steps: withSlot(withSlot(stepItems(STEP_KINDS), STEP_TYPE[kind], 'after', []), STEP_TYPE[kind], slotName, items), after: [] }));
    const bad = (d: PuckDoc) => rules(d).some((r) => r.startsWith('part-home:'));
    const noNotes = (steps: ComponentData[]) => withSlot(steps, 'CheckoutReview', 'after', []);
    for (const kind of ['contact', 'address'] as const) for (const s of ['before', 'after'] as const) expect(bad(at(kind, s, [coupon()])), `${kind}.${s}`).toBe(true);
    // the coupon stored in Shipping.after by default is replaced above; here it is added fresh
    for (const kind of ['shipping', 'payment', 'review'] as const) for (const s of ['before', 'after'] as const) expect(bad(at(kind, s, [coupon()])), `${kind}.${s}`).toBe(false);
    expect(bad(docOf(flow({ steps: withSlot(stepItems(STEP_KINDS), 'CheckoutShipping', 'after', []), aside: [...defaults().aside!, coupon()] })))).toBe(false);
    const section = c('Section', 'sec', { content: [coupon()] });
    expect(bad(at('contact', 'after', [section]))).toBe(true);
    const cols = c('Columns', 'col', { columns: '2', col1: [coupon()] });
    expect(bad(at('shipping', 'after', [cols]))).toBe(false);
    expect(noNotes(stepItems(STEP_KINDS))).toHaveLength(5);
    expect(bad(docOf(flow({ aside: [...defaults().aside!, c('CheckoutPayment', 'pay2')] })))).toBe(true);
    expect(bad(docOf(flow({ lead: [...defaults().lead!, c('CheckoutHeading', 'h2')] })))).toBe(true);
  });
  it('slot-accepts and part-placement', () => {
    expect(rules(docOf(flow({ steps: [...stepItems(STEP_KINDS), c('RichText', 'rt', { bodyHtml: '<p>x</p>', width: 'narrow' })] })))).toContain('slot-accepts:CheckoutFlow.steps');
    expect(rules(docOf(flow({ after: [c('FeaturedProducts', 'fp')] })))).toContain('slot-accepts:CheckoutFlow.after');
    expect(rules(docOf(flow({ after: [c('ProductAddToCart', 'atc')] })))).toContain('part-placement:ProductAddToCart');
  });
  it('hidden-required: hidden Section holding coupon, notes or summary fails; the progress bar may hide', () => {
    const hidden = (child: ComponentData) => c('Section', 'sec', { content: [child], blockStyle: { hide: 'mobile' } });
    const stepsWith = (type: string, child: ComponentData) => withSlot(stepItems(STEP_KINDS), type, 'after', [hidden(child)]);
    expect(rules(docOf(flow({ steps: stepsWith('CheckoutShipping', c('CheckoutCoupon', 'cpn')) })))).toContain('hidden-required:Section');
    expect(rules(docOf(flow({ steps: stepsWith('CheckoutReview', c('CheckoutNotes', 'nts')) })))).toContain('hidden-required:Section');
    expect(rules(docOf(flow({ aside: [hidden(c('CheckoutSummary', 'sum'))] })))).toContain('hidden-required:Section');
    expect(rules(docOf(flow({ lead: [hidden(c('CheckoutProgress', 'prg'))] }))).filter((r) => r.startsWith('hidden-required'))).toEqual([]);
  });
  it('blockStyle.hide on the order summary is dropped by the style allowlist and reported as field:', () => {
    const r = validateDoc(docOf(flow({ aside: [c('CheckoutSummary', 'sum', { blockStyle: { hide: 'mobile' } })] })), 'checkout', 'storefront');
    expect(r.issues.map((i) => i.rule).some((x) => x.startsWith('field:') || x.startsWith('drop:'))).toBe(true);
  });
  it('containsVisibleType: a coupon in a hidden Columns column does not count', () => {
    const coupon = c('CheckoutCoupon', 'cpn');
    expect(containsVisibleType([c('Columns', 'x', { columns: '2', col3: [coupon] })], 'CheckoutCoupon')).toBe(false);
    expect(containsVisibleType([c('Columns', 'x', { columns: '3', col3: [coupon] })], 'CheckoutCoupon')).toBe(true);
  });
});

describe('upgrade of stored v0.7.0 documents', () => {
  it('a bare CheckoutFlow gets the container defaults; present slots are untouched; second pass is identity', () => {
    const up = upgradeDoc(docOf(c('CheckoutFlow', 'cf')), 'checkout', 'storefront');
    const cf = up.content[0]!;
    expect(types(cf.props.steps)).toEqual(STEP_PARTS);
    expect(types(cf.props.head)).toEqual(['CheckoutHeading']);
    expect(upgradeDoc(up, 'checkout', 'storefront')).toBe(up);
    const kept = upgradeDoc(docOf(c('CheckoutFlow', 'cf', { steps: [] })), 'checkout', 'storefront').content[0]!;
    expect(kept.props.steps).toEqual([]);
  });
  it('a step stored { id } gets its default after; a step stored with after [] stays empty', () => {
    const up = upgradeDoc(docOf(c('CheckoutFlow', 'cf', { steps: [c('CheckoutShipping', 'sh'), c('CheckoutReview', 'rv', { before: [], after: [] })] })), 'checkout', 'storefront').content[0]!;
    const [sh, rv] = up.props.steps as ComponentData[];
    expect(types(sh!.props.after)).toEqual(['CheckoutCoupon']);
    expect(rv!.props.after).toEqual([]);
  });
  it('prepareProps keeps absent slots absent', () => {
    const out = prepareProps('CheckoutFlow', { id: 'cf' });
    expect(Object.hasOwn(out, 'steps')).toBe(false);
    const step = prepareProps('CheckoutShipping', { id: 'x' });
    expect(Object.hasOwn(step, 'after')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Rendering: the real CheckoutPage through a guarded document.

const OPTS = { path: '/checkout', route: '/checkout' };
const line = (): LocalLine => ({ productId: 12, displayName: 'Widget Blue', sku: 'WID-BLU', unitPrice: 40, basePrice: 40, pricingTiers: [], quantity: 2, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null });
const makeQuote = (over: Partial<Quote> = {}): Quote => ({
  items: [{ productId: 12, name: 'Widget Blue', sku: 'WID-BLU', quantity: 2, unitPrice: 40, lineTotal: 80, tierApplied: false, isPreorder: false }],
  subtotal: 80, coupon: null,
  shippingOptions: [{ id: 3, name: 'Royal Mail Tracked 24', courier: 'Royal Mail', price: 4.99, freeShipping: false }, { id: 4, name: 'Collect in store', courier: null, price: 0, freeShipping: true }],
  selectedShippingOptionId: null, shippingAmount: 0, storeCredit: { balance: 0, applied: 0, remaining: 0 }, grandTotal: 80, amountDue: 80,
  paymentMethods: [{ slot: 'card', method: 'stripe', displayName: 'Card', type: 'gateway', details: null, feeType: 'percentage', feeValue: 2, feeRateText: '+2%', feeLabel: 'Card fee', fee: 1.6, chargeTotal: 81.6 }],
  contactModes: { emailMode: 'required', phoneMode: 'optional', defaultPhoneCountry: 'GB' },
  ...over,
});
const settings = (guest: boolean): StorefrontSettings => ({
  currency: 'GBP', contactModes: { emailMode: 'required', phoneMode: 'optional', defaultPhoneCountry: 'GB' },
  features: { layout: 'storefront', ordering: true, guestCheckout: guest, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  turnstile: guest ? { siteKey: '1x00000000000000000000AA' } : null,
  brand: { name: 'Northbound Supply', shortName: 'Northbound', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
  supportLinks: [], notices: [], enabled: true,
}) as unknown as StorefrontSettings;
const formWith = (over: Partial<CheckoutForm> = {}): CheckoutForm => ({
  ...DEFAULT_FORM, firstName: 'Ada', surname: 'Lovelace', email: 'ada@example.com', phonePrefix: 'GB',
  addressLine1: '1 Main St', city: 'London', zip: 'SW1A 1AA', country: 'GB', shippingOptionId: 3, paymentMethod: 'stripe', ...over,
});

function prepare(opts: { guest?: boolean; form?: Partial<CheckoutForm>; tgOn?: boolean } = {}) {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  usePrimaryActionStore.setState({ override: null });
  tg.inTelegram = Boolean(opts.tgOn);
  turnstile.minted = 0;
  state.settings = settings(Boolean(opts.guest));
  useCartStore.setState({ lines: [line()], mode: opts.guest ? 'local' : 'server' });
  useSessionStore.setState(opts.guest ? { token: null, customer: null, returnTo: null } : { token: 'sess-1', customer: { id: 5, nickname: 'ada' }, returnTo: null });
  vi.mocked(quote).mockImplementation(() => Promise.resolve(makeQuote()));
  vi.mocked(guestQuote).mockImplementation(() => Promise.resolve(makeQuote()));
  vi.mocked(placeOrder).mockResolvedValue({ reference: 'K7M2QP', publicUrl: null, status: 'pending', total: 84.99, payment: { type: 'none' } });
  vi.mocked(placeGuestOrder).mockResolvedValue({ reference: 'G8N3RQ', publicUrl: null, status: 'pending', total: 84.99, payment: { type: 'none' } });
  persistForm(formWith(opts.form));
}
const mount = (item: ComponentData) => mountDoc('checkout', 'storefront', [item], OPTS);
const count = () => screen.findByText(/^Step \d of 5$/);
const stepNo = () => document.body.textContent?.match(/Step (\d) of 5/)?.[1];
const quoted = () => waitFor(() => expect(vi.mocked(quote).mock.calls.length).toBeGreaterThan(0), { timeout: 4000 });
const press = async (re: RegExp) => { fireEvent.click(await screen.findByRole('button', { name: re })); };
async function toStep(n: number) {
  await count();
  await quoted();
  await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
  for (let i = Number(stepNo()); i < n; i += 1) {
    await press(/^continue$/i);
    await waitFor(() => expect(stepNo()).toBe(String(i + 1)), { timeout: 4000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
  }
}
const labels = () => Array.from(document.querySelectorAll('[data-sf-part="stepper"] [class*="stepLabel"]')).map((e) => e.textContent);
const invalid = () => Array.from(document.querySelectorAll('[aria-invalid="true"]')).map((e) => e.getAttribute('autocomplete'));

beforeEach(() => { state.settings = settings(false); });
afterEach(() => {
  cleanup();
  localStorage.clear();
  useSessionStore.setState({ token: null, customer: null, returnTo: null });
  useCartStore.setState({ lines: [], mode: 'local' });
  usePrimaryActionStore.setState({ override: null });
  tg.inTelegram = false;
});

const T = 30_000;
const ADDRESS_FIRST: StepKind[] = ['address', 'contact', 'shipping', 'payment', 'review'];

describe('arrangement', () => {
  it('Address first: stepper labels follow the order, count says 1 of 5, no Back, Continue validates the address', async () => {
    prepare({ form: { addressLine1: '' } });
    mount(flow({ steps: stepItems(ADDRESS_FIRST) }));
    await count();
    expect(labels()).toHaveLength(5);
    expect(labels()[0]).toBe((TEXT_ENTRIES['checkout.steps.address']!.en as string));
    expect(stepNo()).toBe('1');
    expect(screen.queryByRole('button', { name: /^back$/i })).toBeNull();
    await press(/^continue$/i);
    await waitFor(() => expect(invalid()).toContain('address-line1'));
    expect(invalid()).not.toContain('given-name');
    expect(stepNo()).toBe('1');
  }, T);

  it('a RichText in CheckoutShipping.before renders before the options', async () => {
    prepare();
    const steps = withSlot(stepItems(STEP_KINDS), 'CheckoutShipping', 'before', [c('RichText', 'rt', { bodyHtml: '<p>Free over fifty</p>', width: 'narrow' })]);
    mount(flow({ steps }));
    await toStep(3);
    const note = await screen.findByText('Free over fifty');
    const option = await screen.findByText('Royal Mail Tracked 24');
    expect(note.compareDocumentPosition(option) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, T);

  it('a coupon in the aside renders there; a Heading in after renders after the terms line on review', async () => {
    prepare();
    const steps = withSlot(stepItems(STEP_KINDS), 'CheckoutShipping', 'after', []);
    mount(flow({ steps, aside: [...defaults().aside!, c('CheckoutCoupon', 'cpn')], after: [c('Heading', 'hd', { text: 'Thanks for shopping', level: '2' })] }));
    await count();
    const aside = document.querySelector('aside')!;
    expect(aside.querySelector('input[aria-label]')).not.toBeNull();
    await toStep(5);
    const terms = await screen.findByText((TEXT_ENTRIES['checkout.page.terms']!.en as string));
    const heading = await screen.findByText('Thanks for shopping');
    expect(terms.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, T);

  it('CheckoutProgress removed => no stepper', async () => {
    prepare();
    mount(flow({ lead: [] }));
    await count();
    expect(document.querySelector('[data-sf-part="stepper"]')).toBeNull();
  }, T);

  it('CheckoutNotes moved into CheckoutPayment.after renders on the payment step and not on review', async () => {
    prepare();
    let steps = withSlot(stepItems(STEP_KINDS), 'CheckoutReview', 'after', []);
    steps = withSlot(steps, 'CheckoutPayment', 'after', [c('CheckoutNotes', 'nts')]);
    mount(flow({ steps }));
    await toStep(4);
    expect(document.querySelector('textarea')).not.toBeNull();
    await toStep(5);
    expect(document.querySelector('textarea')).toBeNull();
  }, T);
});

describe('container logic', () => {
  const CONTACT_FOURTH: StepKind[] = ['address', 'shipping', 'payment', 'contact', 'review'];

  it('validate follows the kind: Contact fourth', async () => {
    prepare({ form: { firstName: '', email: '' } });
    mount(flow({ steps: stepItems(CONTACT_FOURTH) }));
    await toStep(3);
    await press(/^continue$/i);
    await waitFor(() => expect(stepNo()).toBe('4'));
    expect(invalid()).toEqual([]);
    await press(/^continue$/i);
    await waitFor(() => expect(invalid()).toContain('given-name'));
    expect(stepNo()).toBe('4');
  }, T);

  it('submit from review goes back to the first failing step in the owner order', async () => {
    prepare();
    const order: StepKind[] = ['address', 'shipping', 'contact', 'payment', 'review'];
    mount(flow({ steps: withSlot(stepItems(order), 'CheckoutShipping', 'after', []), aside: [...defaults().aside!, c('CheckoutCoupon', 'cpn')] }));
    await toStep(5);
    // The shop stops offering both the chosen delivery option and the chosen method.
    vi.mocked(quote).mockImplementation(() => Promise.resolve(makeQuote({ shippingOptions: [{ id: 4, name: 'Collect in store', courier: null, price: 0, freeShipping: true }], paymentMethods: [] })));
    fireEvent.change(document.querySelector('aside input[aria-label]')!, { target: { value: 'NORTH10' } });
    await press(/^apply$/i);
    await waitFor(() => expect(vi.mocked(quote).mock.calls.at(-1)![0]).toMatchObject({ couponCode: 'NORTH10' }), { timeout: 4000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
    await press(/place order/i);
    await waitFor(() => expect(stepNo()).toBe('2'), { timeout: 4000 });
    expect(placeOrder).not.toHaveBeenCalled();
  }, T);

  it('review Change jumps to order.indexOf(kind) and the recap follows the order', async () => {
    prepare();
    const order: StepKind[] = ['address', 'contact', 'shipping', 'payment', 'review'];
    mount(flow({ steps: stepItems(order) }));
    await toStep(5);
    const heads = Array.from(document.querySelectorAll(`.${stepCss.slipHead}`)).map((e) => e.firstChild?.textContent);
    expect(heads).toEqual([
      (TEXT_ENTRIES['checkout.steps.addressTitle']!.en as string), (TEXT_ENTRIES['checkout.steps.contact']!.en as string),
      (TEXT_ENTRIES['checkout.steps.shipping']!.en as string), (TEXT_ENTRIES['checkout.steps.payment']!.en as string),
    ]);
    const changes = Array.from(document.querySelectorAll(`.${stepCss.slipEdit}`));
    fireEvent.click(changes[2]!);
    await waitFor(() => expect(stepNo()).toBe('3'));
    cleanup();
  }, T);

  describe('an absent coupon or notes part ignores the saved value', () => {
    const NO_PARTS = () => {
      let steps = withSlot(stepItems(STEP_KINDS), 'CheckoutShipping', 'after', []);
      steps = withSlot(steps, 'CheckoutReview', 'after', []);
      return steps;
    };
    it('the quote request and the order body carry neither; re-adding the parts restores them', async () => {
      prepare({ form: { couponCode: 'NORTH10', notes: 'leave at door' } });
      mount(flow({ steps: NO_PARTS() }));
      await toStep(5);
      expect(vi.mocked(quote).mock.calls.length).toBeGreaterThan(0);
      for (const call of vi.mocked(quote).mock.calls) expect(call[0].couponCode).toBeUndefined();
      await press(/place order/i);
      await waitFor(() => expect(placeOrder).toHaveBeenCalled());
      const body = vi.mocked(placeOrder).mock.calls[0]![0];
      expect(body.couponCode).toBeUndefined();
      expect(body.notes).toBeUndefined();
      // the persisted form is never rewritten
      cleanup();
      prepare({ form: { couponCode: 'NORTH10', notes: 'leave at door' } });
      mount(flow());
      await toStep(5);
      expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('leave at door');
      expect(vi.mocked(quote).mock.calls.some((c0) => c0[0].couponCode === 'NORTH10')).toBe(true);
      await press(/place order/i);
      await waitFor(() => expect(placeOrder).toHaveBeenCalled());
      expect(vi.mocked(placeOrder).mock.calls[0]![0]).toMatchObject({ couponCode: 'NORTH10', notes: 'leave at door' });
    }, T);

    it('a 404 is not attributed to a coupon that is not on the page', async () => {
      prepare({ form: { couponCode: 'NORTH10' } });
      vi.mocked(quote).mockImplementation(() => Promise.reject(new ApiError(404, 'Gate is off')));
      mount(flow({ steps: NO_PARTS() }));
      await count();
      await screen.findByText('Gate is off');
      expect(screen.queryByText((TEXT_ENTRIES['checkout.errors.unknownCode']!.en as string))).toBeNull();
    }, T);

    it('a guest quote carries no coupon and mints one token', async () => {
      prepare({ guest: true, form: { couponCode: 'NORTH10' } });
      mount(flow({ steps: NO_PARTS() }));
      await count();
      await waitFor(() => expect(vi.mocked(guestQuote).mock.calls.length).toBeGreaterThan(0), { timeout: 6000 });
      await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
      expect(vi.mocked(guestQuote).mock.calls.length).toBe(turnstile.minted);
      for (const call of vi.mocked(guestQuote).mock.calls) expect(call[0].couponCode).toBeUndefined();
    }, T);
  });

  it('Telegram: Continue on steps 1-4, Place order on the last, first-step nav omitted by position', async () => {
    prepare({ tgOn: true });
    mount(flow({ steps: stepItems(ADDRESS_FIRST) }));
    await count();
    expect(document.querySelector(`.${stepCss.step}`)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^back$/i })).toBeNull();
    const action = () => usePrimaryActionStore.getState().override!;
    expect(action().label).toMatch(/^continue$/i);
    await quoted();
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    for (let i = 2; i <= 5; i += 1) {
      act(() => action().onClick());
      await waitFor(() => expect(stepNo()).toBe(String(i)), { timeout: 4000 });
      await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
      expect(action().label).toMatch(i < 5 ? /^continue$/i : /^place order/i);
    }
  }, T);
});

describe('fix round 1 coverage', () => {
  const NO_PARTS = () => withSlot(withSlot(stepItems(STEP_KINDS), 'CheckoutShipping', 'after', []), 'CheckoutReview', 'after', []);
  const guestQuoted = () => waitFor(() => expect(vi.mocked(guestQuote).mock.calls.length).toBeGreaterThan(0), { timeout: 6000 });
  const pause = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

  it('an illegal stored step order renders the default arrangement', async () => {
    prepare();
    mountAt(<RenderDoc doc={docOf(flow({ steps: stepItems(['review', 'contact', 'address', 'shipping', 'payment']) }))} docKey="checkout" layout="storefront" />, OPTS);
    await count();
    expect(labels()).toEqual(STEP_KINDS.map((k) => (TEXT_ENTRIES[`checkout.steps.${k}`]!.en as string)));
    expect(screen.queryByRole('button', { name: /place order/i })).toBeNull();
    await toStep(5);
    expect(await screen.findByRole('button', { name: /place order/i })).toBeTruthy();
  }, T);

  it('guest, coupon part absent, saved code: one mint and one quote', async () => {
    prepare({ guest: true, form: { couponCode: 'NORTH10' } });
    mount(flow({ steps: NO_PARTS() }));
    await count();
    await guestQuoted();
    await pause(1200);
    expect(turnstile.minted).toBe(1);
    expect(vi.mocked(guestQuote).mock.calls).toHaveLength(1);
  }, T);

  it('positive control: with the coupon part, applying a code mints again', async () => {
    prepare({ guest: true });
    mount(flow());
    await count();
    await guestQuoted();
    await pause(1200);
    expect(turnstile.minted).toBe(1);
    for (let i = 1; i < 3; i += 1) {
      await press(/^continue$/i);
      await waitFor(() => expect(stepNo()).toBe(String(i + 1)), { timeout: 4000 });
      await pause(1200);
    }
    fireEvent.change(await screen.findByLabelText(TEXT_ENTRIES['checkout.coupon.codeLabel']!.en as string), { target: { value: 'NORTH10' } });
    await press(/^apply$/i);
    await waitFor(() => expect(turnstile.minted).toBe(2), { timeout: 6000 });
  }, T);

  it('placeGuestOrder body carries no coupon or notes without the parts', async () => {
    prepare({ guest: true, form: { couponCode: 'NORTH10', notes: 'leave at door' } });
    mount(flow({ steps: NO_PARTS() }));
    await count();
    await guestQuoted();
    await pause(1200);
    for (let i = 1; i < 5; i += 1) {
      await press(/^continue$/i);
      await waitFor(() => expect(stepNo()).toBe(String(i + 1)), { timeout: 4000 });
      await pause(1200);
    }
    await press(/place order/i);
    await waitFor(() => expect(placeGuestOrder).toHaveBeenCalled(), { timeout: 6000 });
    const body = vi.mocked(placeGuestOrder).mock.calls[0]![0];
    expect(body.couponCode).toBeUndefined();
    expect(body.notes).toBeUndefined();
  }, T);
});

describe('css', () => {
  it('the heading rules carry the block colour and text scale variables', () => {
    const css = readFileSync(resolve(__dirname, '../src/features/checkout/CheckoutPage.module.css'), 'utf8');
    for (const sel of ['.eyebrow', '.title']) {
      const body = css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
      expect(body).toContain('var(--sf-block-fg,');
      expect(body).toContain('var(--sf-text-scale, 1)');
    }
  });
});
