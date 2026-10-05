import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings as unknown as StorefrontSettings }));

import '@/builder/render.tsx';
import { BLOCKS } from '@/builder/registry.ts';
import { checkRules } from '@/builder/rules.ts';
import { upgradeItems } from '@/builder/upgrade.ts';
import { fixedSlot, part, partId } from '@/builder/parts.ts';
import { BuilderModeProvider } from '@/builder/mode.ts';
import { LoginFamily } from '@/builder/family-login.ts';
import { PaymentFamily, type PaymentPreview } from '@/builder/family-payment.ts';
import { LOGIN_CONTAINER } from '@/builder/blocks/_shared/login-container.ts';
import { ORDER_PLACED_CONTAINER, PAYMENT_CANCEL_CONTAINER, PAYMENT_SUCCESS_CONTAINER } from '@/builder/blocks/_shared/payment-container.ts';
import type { ComponentData, DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { LoginPage } from '@/features/auth/LoginPage.tsx';
import { PaymentSuccessPage } from '@/features/payment-redirect/PaymentSuccessPage.tsx';
import { PaymentCancelPage } from '@/features/payment-redirect/PaymentCancelPage.tsx';
import { OrderPlacedPage } from '@/features/payment-redirect/OrderPlacedPage.tsx';
import { ReferenceRow } from '@/features/payment-redirect/ReferenceRow.tsx';
import { ContactLinks } from '@/components/ContactLinks.tsx';
import { useCartStore } from '@/stores/cart.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useTelegramAuthStore } from '@/stores/telegram.ts';
import { mountDoc } from './helpers/stage4-golden.tsx';
import { STAGE4_PARTS } from './helpers/stage4-parts.ts';

const LOGIN_PARTS = ['LoginHeading', 'LoginMethods'] as const;
const PAYMENT_PARTS = ['PaymentMark', 'PaymentEyebrow', 'PaymentHeadline', 'PaymentMessage', 'PaymentReference', 'PaymentActions', 'PaymentContact', 'PaymentBack'] as const;
const CONTAINERS = [
  { name: 'LoginOptions', docKey: 'login' as DocKey, spec: LOGIN_CONTAINER, parts: LOGIN_PARTS },
  { name: 'PaymentSuccess', docKey: 'payment-success' as DocKey, spec: PAYMENT_SUCCESS_CONTAINER, parts: PAYMENT_PARTS },
  { name: 'PaymentCancel', docKey: 'payment-cancel' as DocKey, spec: PAYMENT_CANCEL_CONTAINER, parts: PAYMENT_PARTS },
  { name: 'OrderPlaced', docKey: 'order-placed' as DocKey, spec: ORDER_PLACED_CONTAINER, parts: PAYMENT_PARTS },
];
const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];
type Links = { whatsapp: string | null; telegram: string | null };
const NO_LINKS: Links = { whatsapp: null, telegram: null };
const LINKS: Links = { whatsapp: 'https://wa.me/447700900000', telegram: 'https://t.me/northbound_bot' };

function useSettingsState(links = NO_LINKS) {
  state.settings = {
    currency: 'GBP', enabled: true, supportLinks: [], notices: [], features: {},
    brand: { name: 'Northbound Supply', shortName: 'Northbound', title: 'Northbound Supply', tagline: null, links },
    login: { whatsapp: { available: true, number: '447700900000' }, telegram: { available: false, botUsername: null } },
  };
}

const realClear = useCartStore.getState().clear;
beforeEach(() => { localStorage.clear(); useSettingsState(); });
afterEach(() => {
  cleanup();
  localStorage.clear();
  useSessionStore.setState({ token: null, customer: null, returnTo: null });
  useTelegramAuthStore.setState({ status: 'none', error: null });
  useCartStore.setState({ lines: [], mode: 'local', clear: realClear });
});

const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const doc = (_docKey: DocKey, container: ComponentData): PuckDoc => ({ root: { props: { title: '', description: '', chrome: 'shell' } }, content: [container], zones: {} });
const rules = (name: string, docKey: DocKey, content: ComponentData[], layout: LayoutKind = 'storefront') =>
  checkRules(doc(docKey, c(name, 'x', { content })), docKey, layout).map((i) => i.rule);
const defaults = (name: string, layout: LayoutKind = 'storefront') => BLOCKS[name]!.container!.defaultSlots({}, { layout, id: 'x' }).content!;
const rich = (id: string, text: string) => c('RichText', id, { bodyHtml: `<p>${text}</p>`, width: 'narrow' });
const without = (items: ComponentData[], type: string) => items.filter((i) => i.type !== type);

async function show(docKey: DocKey, container: ComponentData, path: string) {
  const m = mountDoc(docKey, 'storefront', [container], { path });
  await screen.findByRole('heading', { level: 1 }, { timeout: 30_000 });
  return m;
}
const stored = (name: string, props: Record<string, unknown> = {}) => c(name, `${name}-x`, props);
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('contract', () => {
  it.each([...LOGIN_PARTS, ...PAYMENT_PARTS])('%s is a part of its family with the binding style row', (name) => {
    const def = BLOCKS[name]!;
    expect(def.category).toBe('part');
    expect(def.part?.family).toBe(STAGE4_PARTS[name]!.family);
    const want = STAGE4_PARTS[name]!.style;
    expect(def.style && def.style.target).toBe(want.target);
    expect([...(def.style ? def.style.keys : [])].sort()).toEqual([...want.keys].sort());
  });

  it.each(CONTAINERS)('$name: required parts carry no hide (except where a sibling container does not require them)', ({ name, spec }) => {
    for (const r of spec.required) {
      if (r === 'PaymentReference' || r === 'PaymentActions') continue; // required on some containers only; the rule reports a hidden one
      expect(BLOCKS[r]!.style && BLOCKS[r]!.style.keys, `${name}.${r}`).not.toContain('hide');
    }
  });

  it('the spec §5.5 / §5.6 requirements, offers and defaults', () => {
    expect(LOGIN_CONTAINER.required).toEqual(['LoginHeading', 'LoginMethods']);
    expect(PAYMENT_SUCCESS_CONTAINER.required).toEqual(['PaymentHeadline', 'PaymentReference']);
    expect(PAYMENT_CANCEL_CONTAINER.required).toEqual(['PaymentHeadline', 'PaymentActions']);
    expect(ORDER_PLACED_CONTAINER.required).toEqual(['PaymentHeadline', 'PaymentReference', 'PaymentActions']);
    expect(PAYMENT_SUCCESS_CONTAINER.offers).toBeUndefined();
    expect(PAYMENT_CANCEL_CONTAINER.offers).toBeUndefined();
    expect(ORDER_PLACED_CONTAINER.offers).toBeUndefined();
    for (const { spec } of CONTAINERS) expect(spec.insertSlot).toBe('content');
    expect(defaults('PaymentSuccess').map((i) => i.type)).toEqual(['PaymentMark', 'PaymentEyebrow', 'PaymentHeadline', 'PaymentMessage', 'PaymentReference', 'PaymentActions', 'PaymentContact', 'PaymentBack']);
    expect(defaults('PaymentCancel').map((i) => i.type)).toEqual(['PaymentMark', 'PaymentEyebrow', 'PaymentHeadline', 'PaymentMessage', 'PaymentReference', 'PaymentActions', 'PaymentContact']);
    expect(defaults('OrderPlaced').map((i) => i.type)).toEqual(['PaymentMark', 'PaymentEyebrow', 'PaymentHeadline', 'PaymentMessage', 'PaymentReference', 'PaymentActions', 'PaymentBack']);
    expect(defaults('LoginOptions').map((i) => i.type)).toEqual(['LoginHeading', 'LoginMethods']);
  });

  it('a part view outside its container renders nothing and does not throw', () => {
    const { container } = render(<><LoginFamily.PartHost name="LoginHeading" props={{}} /><PaymentFamily.PartHost name="PaymentBack" props={{}} /></>);
    expect(container.innerHTML).toBe('');
  });

  it.each(CONTAINERS)('$name: default ids are unique, at most 64 characters and pass the rules in every layout', ({ name, docKey, spec }) => {
    for (const layout of LAYOUTS) {
      const items = defaults(name, layout);
      const ids = items.map((i) => i.props.id as string);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id.length).toBeLessThanOrEqual(64);
      expect(ids[0]).toBe(partId('x', items[0]!.type));
      expect(rules(name, docKey, items, layout).filter((r) => r.startsWith('part-') || r.startsWith('hidden-') || r.startsWith('slot-'))).toEqual([]);
    }
    expect(spec.unique.length).toBeGreaterThan(0);
  });

  it('the container blocks keep their style, route binding and one content slot; text narrowed', () => {
    for (const { name } of CONTAINERS) {
      const def = BLOCKS[name]!;
      expect(def.slots).toEqual(['content']);
      expect(def.routeBound).toBe(true);
      expect(def.style).toEqual({ target: 'wrap', keys: expect.arrayContaining(['bg', 'padTop']) });
    }
    expect(BLOCKS.PaymentCancel!.text).toEqual([]);
  });

  it('parts that offer fg / textSize read both variables in their CSS module; the others do not need them', () => {
    const read = (p: string) => readFileSync(resolve(process.cwd(), 'src/features', p), 'utf8');
    const payment = read('payment-redirect/PaymentRedirect.module.css');
    const login = read('auth/LoginPage.module.css');
    for (const css of [payment, login]) {
      expect(css).toContain('var(--sf-block-fg,');
      expect(css).toContain('var(--sf-text-scale, 1)');
    }
    for (const sel of ['.eyebrow', '.headline', '.detail', '.alert', '.referenceLabel', '.referenceValue']) {
      const rule = payment.slice(payment.indexOf(`${sel} {`));
      const body = rule.slice(0, rule.indexOf('}'));
      expect(body, sel).toContain('--sf-block-fg');
    }
    for (const sel of ['.title', '.lede']) {
      const rule = login.slice(login.indexOf(`${sel} {`));
      const body = rule.slice(0, rule.indexOf('}'));
      expect(body, sel).toContain('--sf-block-fg');
      expect(body, sel).toContain('--sf-text-scale');
    }
  });

  it('ReferenceRow and ContactLinks add no attribute without rootAttrs', () => {
    useSettingsState(LINKS);
    const { container } = render(<MantineProvider env="test"><ReferenceRow value="NB-1" /><ContactLinks /></MantineProvider>);
    for (const el of container.querySelectorAll('[data-sf-style]')) throw new Error(`unexpected ${el.outerHTML}`);
    const styled = render(<MantineProvider env="test"><ReferenceRow value="NB-1" rootAttrs={{ 'data-sf-style': 'PaymentReference' }} /><ContactLinks rootAttrs={{ 'data-sf-style': 'PaymentContact' }} /></MantineProvider>);
    expect(styled.container.querySelectorAll('[data-sf-style]')).toHaveLength(2);
  });
});

describe('rules', () => {
  it.each(CONTAINERS)('$name: a missing or doubled required part is reported on the container', ({ name, docKey, spec }) => {
    const items = defaults(name);
    for (const r of spec.required) {
      expect(rules(name, docKey, without(items, r)), `${name} - ${r}`).toContain(`part-required:${name}.${r}`);
      expect(rules(name, docKey, [...items, part(r, 'x', `${r}-2`)]), `${name} + ${r}`).toContain(`part-required:${name}.${r}`);
    }
  });

  it.each(CONTAINERS)('$name: every optional part may appear only once', ({ name, docKey, spec, parts }) => {
    const items = defaults(name);
    for (const p of parts.filter((x) => !spec.required.includes(x) && items.some((i) => i.type === x))) {
      expect(rules(name, docKey, [...items, part(p, 'x', `${p}-2`)]), `${name} + ${p}`).toContain(`part-unique:${name}.${p}`);
    }
  });

  it('PaymentActions is offered on every payment page, once', () => {
    expect(rules('PaymentSuccess', 'payment-success', [...defaults('PaymentSuccess')]).filter((r) => r.startsWith('part-placement'))).toEqual([]);
    expect(rules('PaymentCancel', 'payment-cancel', [...defaults('PaymentCancel')]).filter((r) => r.startsWith('part-placement'))).toEqual([]);
  });

  it('PaymentActions is required on the cancel and placed pages, optional on success', () => {
    expect(rules('PaymentCancel', 'payment-cancel', without(defaults('PaymentCancel'), 'PaymentActions'))).toContain('part-required:PaymentCancel.PaymentActions');
    expect(rules('OrderPlaced', 'order-placed', without(defaults('OrderPlaced'), 'PaymentActions'))).toContain('part-required:OrderPlaced.PaymentActions');
    expect(rules('PaymentSuccess', 'payment-success', defaults('PaymentSuccess')).filter((r) => r.startsWith('part-'))).toEqual([]);
  });

  it('a payment part hidden where it is required is reported; where it is optional it is not', () => {
    const hide = (items: ComponentData[], type: string) => items.map((i) => (i.type === type ? { ...i, props: { ...i.props, blockStyle: { hide: 'mobile' } } } : i));
    expect(rules('PaymentSuccess', 'payment-success', hide(defaults('PaymentSuccess'), 'PaymentReference'))).toContain('hidden-required:PaymentReference');
    expect(rules('PaymentCancel', 'payment-cancel', hide(defaults('PaymentCancel'), 'PaymentReference'))).not.toContain('hidden-required:PaymentReference');
    expect(rules('PaymentCancel', 'payment-cancel', hide(defaults('PaymentCancel'), 'PaymentActions'))).toContain('hidden-required:PaymentActions');
  });

  it('a part inside another family container is misplaced', () => {
    expect(rules('LoginOptions', 'login', [...defaults('LoginOptions'), part('PaymentBack', 'x')])).toContain('part-placement:PaymentBack');
    expect(rules('PaymentSuccess', 'payment-success', [...defaults('PaymentSuccess'), part('LoginHeading', 'x')])).toContain('part-placement:LoginHeading');
  });

  it('login parts may not leave the login document', () => {
    expect(checkRules(doc('payment-success', c('PaymentSuccess', 'x', { content: [...defaults('PaymentSuccess'), part('LoginMethods', 'x')] })), 'payment-success', 'storefront').map((i) => i.rule))
      .toContain('part-placement:LoginMethods');
  });
});

describe('upgrade (spec §8)', () => {
  it.each(CONTAINERS)('$name: absent content is filled from defaultSlots; a present slot is untouched; idempotent', ({ name }) => {
    const absent = [c(name, 'x')];
    const up = upgradeItems(absent, 'storefront');
    expect(up[0]!.props.content).toEqual(BLOCKS[name]!.container!.defaultSlots({}, { layout: 'storefront', id: 'x' }).content);
    expect(upgradeItems(up, 'storefront')).toEqual(up);
    const empty = [c(name, 'y', { content: [] })];
    expect(upgradeItems(empty, 'storefront')[0]!.props.content).toEqual([]);
    const once = upgradeItems(absent, 'storefront');
    expect(upgradeItems(once, 'storefront')[0]).toBe(once[0]);
  });
});

describe('sign-in page arrangement', () => {
  it('a stored container with absent slots renders heading then methods (upgrade path)', async () => {
    const { container } = await show('login', stored('LoginOptions'), '/login');
    const h1 = container.querySelector('h1')!;
    const methods = container.querySelector('[class*="_options_"]')!;
    expect(h1.textContent).toContain('Northbound Supply');
    expect(before(h1, methods)).toBe(true);
  });

  it('the heading can sit below the methods, with a text block between', async () => {
    const content = [part('LoginMethods', 'l'), rich('rt', 'Need help?'), part('LoginHeading', 'l')];
    const { container } = await show('login', c('LoginOptions', 'l', { content }), '/login');
    const methods = container.querySelector('[class*="_options_"]')!;
    const note = [...container.querySelectorAll('p')].find((p) => p.textContent === 'Need help?')!;
    const h1 = container.querySelector('h1')!;
    expect(before(methods, note)).toBe(true);
    expect(before(note, h1)).toBe(true);
    expect(container.querySelectorAll('[class*="_page_"]')).toHaveLength(1);
  });

  it('the methods part carries its style attributes, the heading its own', async () => {
    const content = [{ ...part('LoginHeading', 'l'), props: { ...part('LoginHeading', 'l').props, blockStyle: { fg: 'primary' } } },
      { ...part('LoginMethods', 'l'), props: { ...part('LoginMethods', 'l').props, blockStyle: { padTop: 'sm' } } }];
    const { container } = await show('login', c('LoginOptions', 'l', { content }), '/login');
    expect(container.querySelector('[data-sf-style="LoginHeading"]')!.querySelector('h1')).not.toBeNull();
    expect(container.querySelector('[data-sf-style="LoginMethods"]')!.getAttribute('data-sfs-pt')).toBe('sm');
  });

  it('the Telegram sign-in error screen shows before any slot, with and without slots', () => {
    useTelegramAuthStore.setState({ status: 'failed', error: 'bad hash' });
    const wrap = (ui: ReactNode) => render(
      <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter initialEntries={['/login']}>
        <Routes><Route path="/login" element={ui} /></Routes></MemoryRouter></MantineProvider></QueryClientProvider>,
    );
    const first = wrap(<LoginPage />);
    expect(first.container.textContent).toContain('bad hash');
    first.unmount();
    const second = wrap(<LoginPage slots={{ content: fixedSlot(<p>SLOT CONTENT</p>) }} />);
    expect(second.container.textContent).toContain('bad hash');
    expect(second.container.textContent).not.toContain('SLOT CONTENT');
  });
});

describe('payment pages', () => {
  it('success without its contact links and its mark', async () => {
    useSettingsState(LINKS);
    const content = without(without(defaults('PaymentSuccess'), 'PaymentContact'), 'PaymentMark');
    const { container } = await show('payment-success', c('PaymentSuccess', 'x', { content }), '/payment/success?order=NB-1001');
    expect(container.querySelector('[class*="_contact_"]')).toBeNull();
    expect(container.querySelector('[class*="_ring_"]')).toBeNull();
    expect(container.querySelector('[class*="_referenceRow_"]')).not.toBeNull();
    expect(container.querySelector('[class*="_back_"]')).not.toBeNull();
  });

  it('a stored success container with absent slots renders the full v0.7.0 page', async () => {
    useSettingsState(LINKS);
    const { container } = await show('payment-success', stored('PaymentSuccess'), '/payment/success?order=NB-1001');
    for (const sel of ['_ring_', '_eyebrow_', '_headline_', '_detail_', '_referenceRow_', '_contact_', '_back_']) expect(container.querySelector(`[class*="${sel}"]`), sel).not.toBeNull();
    expect(container.querySelector('[class*="_actions_"]')).toBeNull();
  });

  it('cancel with a back link added', async () => {
    const content = [...defaults('PaymentCancel'), part('PaymentBack', 'x')];
    const { container } = await show('payment-cancel', c('PaymentCancel', 'x', { content }), '/payment/cancel?order=NB-1002');
    expect(container.querySelector('[class*="_back_"]')).not.toBeNull();
    expect(container.querySelector('[class*="_actions_"]')).not.toBeNull();
  });

  it('a stored cancel container with absent slots keeps its actions; hiding the optional message and reference removes them', async () => {
    const full = await show('payment-cancel', stored('PaymentCancel'), '/payment/cancel?order=NB-1002');
    expect(full.container.querySelector('[class*="_actions_"]')).not.toBeNull();
    expect(full.container.querySelector('[class*="_detail_"]')).not.toBeNull();
    cleanup();
    const content = without(without(defaults('PaymentCancel'), 'PaymentMessage'), 'PaymentReference');
    const slim = await show('payment-cancel', c('PaymentCancel', 'x', { content }), '/payment/cancel?order=NB-1002');
    expect(slim.container.querySelector('[class*="_detail_"]')).toBeNull();
    expect(slim.container.querySelector('[class*="_referenceRow_"]')).toBeNull();
    expect(slim.container.querySelector('[class*="_actions_"]')).not.toBeNull();
  });

  it('placed with the reference above the headline', async () => {
    useSettingsState(LINKS);
    const d = defaults('OrderPlaced');
    const content = [part('PaymentReference', 'x'), ...without(d, 'PaymentReference')];
    const { container } = await show('order-placed', c('OrderPlaced', 'x', { content }), '/order-placed?order=NB-1003');
    expect(before(container.querySelector('[class*="_referenceRow_"]')!, container.querySelector('h1')!)).toBe(true);
  });

  it('placed: the warning, the chat hint and the no-chat fallback follow the message and actions parts', async () => {
    const warn = await show('order-placed', stored('OrderPlaced'), '/order-placed?order=NB-1003&warning=1');
    expect(warn.container.querySelector('p[role="status"]')).not.toBeNull();
    expect(warn.container.querySelector('[class*="_fallback_"]')).not.toBeNull();
    cleanup();
    useSettingsState(LINKS);
    const chat = await show('order-placed', stored('OrderPlaced'), '/order-placed?order=NB-1003');
    expect(chat.container.querySelector('[class*="_detail_"]')).not.toBeNull();
    expect(chat.container.querySelectorAll('[class*="_cta_"]')).toHaveLength(2);
    cleanup();
    const slim = await show('order-placed', c('OrderPlaced', 'x', { content: without(defaults('OrderPlaced'), 'PaymentMessage') }), '/order-placed?order=NB-1003');
    expect(slim.container.querySelector('[class*="_detail_"]')).toBeNull();
    expect(slim.container.querySelectorAll('[class*="_cta_"]')).toHaveLength(2);
  });

  it('placed: a signed-in customer gets a way to their order, with or without chat links; a guest does not', async () => {
    useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
    const bare = await show('order-placed', stored('OrderPlaced'), '/order-placed?order=NB-1003');
    const link = screen.getByRole('link', { name: 'View your order' });
    expect(link.getAttribute('href')).toBe('/account/orders/NB-1003');
    expect(bare.container.querySelector('[class*="_fallback_"]')).not.toBeNull();
    cleanup();
    useSettingsState(LINKS);
    await show('order-placed', stored('OrderPlaced'), '/order-placed?order=NB-1003');
    expect(screen.getByRole('link', { name: 'View your order' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Pay via WhatsApp/ })).toBeTruthy();
    cleanup();
    useSessionStore.setState({ token: null, customer: null });
    await show('order-placed', stored('OrderPlaced'), '/order-placed?order=NB-1003');
    expect(screen.queryByRole('link', { name: 'View your order' })).toBeNull();
  });

  it('style attributes land on the part roots', async () => {
    const styled = (type: string, blockStyle: Record<string, string>) => ({ ...part(type, 'x'), props: { ...part(type, 'x').props, blockStyle } });
    const content = defaults('PaymentCancel').map((i) =>
      i.type === 'PaymentHeadline' ? styled('PaymentHeadline', { fg: 'primary' })
        : i.type === 'PaymentReference' ? styled('PaymentReference', { padTop: 'sm' })
          : i.type === 'PaymentActions' ? styled('PaymentActions', { padTop: 'sm' }) : i);
    const { container } = await show('payment-cancel', c('PaymentCancel', 'x', { content }), '/payment/cancel?order=NB-1002');
    expect(container.querySelector('h1')!.getAttribute('data-sfs-fg')).toBe('primary');
    expect(container.querySelector('[class*="_referenceRow_"]')!.getAttribute('data-sf-style')).toBe('PaymentReference');
    expect(container.querySelector('[class*="_actions_"]')!.getAttribute('data-sf-style')).toBe('PaymentActions');
  });

  it.each([['payment-success', 'PaymentSuccess', '/payment/success?order=NB-1001'], ['order-placed', 'OrderPlaced', '/order-placed?order=NB-1003']] as const)(
    '%s clears the cart and the saved checkout form exactly once, with arranged slots',
    async (docKey, name, path) => {
      const clear = vi.fn();
      useCartStore.setState({ clear });
      const content = [...defaults(name)].reverse();
      await show(docKey, c(name, 'x', { content }), path);
      expect(clear).toHaveBeenCalledTimes(1);
    },
  );

  it('a signed-in customer is still handed from a successful payment to their order page', async () => {
    useSessionStore.setState({ token: 't', customer: { id: 1, nickname: null } });
    const m = mountDoc('payment-success', 'storefront', [stored('PaymentSuccess')], { path: '/payment/success?order=NB-1001' });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(m.container.querySelector('h1')).toBeNull();
  });
});

describe('preview states (editor only)', () => {
  const FIXTURE: PaymentPreview = { orderRef: 'NB-PREVIEW', signIn: null, warning: false, whatsapp: LINKS.whatsapp, telegram: LINKS.telegram };
  function previewed(Page: () => ReactNode, name: string, fixture: PaymentPreview) {
    return render(
      <QueryClientProvider client={new QueryClient()}><MantineProvider env="test">
        <BuilderModeProvider value={{ editing: true, previewAs: null, previewFixtures: { [name]: fixture } }}>
          <MemoryRouter initialEntries={['/x']}><Routes><Route path="/x" element={<Page />} /></Routes></MemoryRouter>
        </BuilderModeProvider>
      </MantineProvider></QueryClientProvider>,
    );
  }
  const lines = [{ productId: 1, quantity: 2 }] as never;

  it('success: renders the fixture reference, leaves the cart alone and never redirects, even for a signed-in customer', () => {
    const clear = vi.fn();
    useCartStore.setState({ clear, lines });
    const { container } = previewed(() => <PaymentSuccessPage />, 'PaymentSuccess', { ...FIXTURE, signIn: '/login' });
    expect(container.textContent).toContain('NB-PREVIEW');
    expect(container.querySelector('h1')).not.toBeNull();
    expect(clear).not.toHaveBeenCalled();
    expect(useCartStore.getState().lines).toBe(lines);
  });

  it('success: the "missing" state shows the missing-reference screen', () => {
    const { container } = previewed(() => <PaymentSuccessPage />, 'PaymentSuccess', { ...FIXTURE, orderRef: null });
    expect(container.querySelector('h2')).not.toBeNull();
    expect(container.querySelector('h1')).toBeNull();
  });

  it('cancel: a sign-in link shows the sign-in action, none the back-to-shop one, no reference hides the row', () => {
    const signedOut = previewed(() => <PaymentCancelPage />, 'PaymentCancel', { ...FIXTURE, signIn: '/login?returnTo=%2Faccount%2Forders%2FNB-PREVIEW' });
    expect(signedOut.container.querySelector('[class*="_actions_"] a')!.getAttribute('href')).toBe('/login?returnTo=%2Faccount%2Forders%2FNB-PREVIEW');
    expect(signedOut.container.querySelector('[class*="_referenceRow_"]')).not.toBeNull();
    cleanup();
    const plain = previewed(() => <PaymentCancelPage />, 'PaymentCancel', FIXTURE);
    expect(plain.container.querySelector('[class*="_actions_"] a')!.getAttribute('href')).toBe('/');
    cleanup();
    const none = previewed(() => <PaymentCancelPage />, 'PaymentCancel', { ...FIXTURE, orderRef: null });
    expect(none.container.querySelector('[class*="_referenceRow_"]')).toBeNull();
  });

  it('placed: warning, chat and no-chat states come from the fixture, not the URL or the shop settings; the cart is untouched', () => {
    const clear = vi.fn();
    useCartStore.setState({ clear, lines });
    const warn = previewed(() => <OrderPlacedPage />, 'OrderPlaced', { ...FIXTURE, warning: true });
    expect(warn.container.querySelector('p[role="status"]')).not.toBeNull();
    cleanup();
    const chat = previewed(() => <OrderPlacedPage />, 'OrderPlaced', FIXTURE);
    expect(chat.container.querySelectorAll('[class*="_cta_"]')).toHaveLength(2);
    cleanup();
    const bare = previewed(() => <OrderPlacedPage />, 'OrderPlaced', { ...FIXTURE, whatsapp: null, telegram: null });
    expect(bare.container.querySelector('[class*="_fallback_"]')).not.toBeNull();
    expect(clear).not.toHaveBeenCalled();
    expect(useCartStore.getState().lines).toBe(lines);
  });
});
