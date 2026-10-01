import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Suspense } from 'react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { ServerCartLine } from '@/types/cart.ts';

const state = vi.hoisted(() => ({
  features: {} as Record<string, unknown>,
  issues: [] as unknown[],
  isSyncing: false,
  refresh: undefined as unknown as ReturnType<typeof import('vitest').vi.fn>,
  boom: false,
}));

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    features: state.features,
  }) as unknown as StorefrontSettings,
}));
vi.mock('@/templates/runtime.tsx', async (orig) => ({ ...(await orig<typeof import('@/templates/runtime.tsx')>()), Slot: () => null }));
vi.mock('@/features/cart/useServerCart.ts', () => ({
  useServerCart: () => ({
    mode: 'local', isSyncing: state.isSyncing, issues: state.issues,
    add: () => {}, setQuantity: () => {}, remove: () => {}, sync: async () => {}, refresh: state.refresh,
  }),
}));
// A published rich-text block that crashes on demand: the only way to reach the drawer's document boundary.
vi.mock('@/builder/blocks/_shared/RichHtml.tsx', async (orig) => {
  const real = await orig<typeof import('@/builder/blocks/_shared/RichHtml.tsx')>();
  return { ...real, RichHtml: (p: never) => { if (state.boom) throw new Error('boom'); return (real.RichHtml as (p: never) => unknown)(p) as never; } };
});

import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { checkRules } from '@/builder/rules.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { upgradeDoc } from '@/builder/upgrade.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { part, partId } from '@/builder/parts.ts';
import { PageSetContext } from '@/builder/page-set-context.ts';
import type { ComponentData, LayoutKind, PageSet, PuckDoc } from '@/builder/types.ts';
import { CART_CONTAINER, CART_SUMMARY_CONTAINER } from '@/builder/blocks/_shared/cart-container.ts';
import { CartPage } from '@/features/cart/CartPage.tsx';
import { CartHostContext } from '@/features/cart/cart-host.ts';
import { CartSummary } from '@/features/cart/CartSummary.tsx';
import { CartDrawer } from '@/features/cart/CartDrawer.tsx';
import { resetCartDrawerFallback } from '@/builder/blocks/_shared/cart-views.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';
import { useSessionStore } from '@/stores/session.ts';
import { BOX, TEXT, VIS } from '@/builder/style/model.ts';
import { STAGE4_PARTS } from './helpers/stage4-parts.ts';
import pageCss from '@/features/cart/CartPage.module.css';
import { mountAt } from './helpers/stage4-golden.tsx';

const CART_PARTS = ['CartHeading', 'CartLines', 'CartEmpty'];
const SUMMARY_PARTS = ['CartSummaryNotice', 'CartSummarySubtotal', 'CartSummaryTerms', 'CartSummaryCheckout', 'CartSummaryContinue'];

const line = (id: number, quantity = 1, over: Partial<LocalLine> = {}): LocalLine => ({
  productId: id, displayName: `Oat Bar ${id}`, sku: `NB-${id}`, unitPrice: 4.5, basePrice: 4.5, pricingTiers: [], quantity,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null, ...over,
});
const issue = (productId: number, over: Partial<ServerCartLine>): ServerCartLine => ({
  productId, name: `Oat Bar ${productId}`, quantity: 1, unitPrice: 4.5, lineTotal: 4.5, imageUrl: null, isPreorder: false,
  outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null, ...over,
});
const seed = (lines: LocalLine[], issues: ServerCartLine[] = []) => {
  state.issues = issues;
  useCartStore.setState({ lines, mode: 'local' });
};

// The drawer requests its panel when its module loads (before a shopper can open it); wait for that here.
beforeAll(async () => {
  await import('@/features/cart/CartDrawerPanel.tsx');
  await new Promise((r) => setTimeout(r, 50));
});
beforeEach(() => {
  state.features = { layout: 'storefront', ordering: true, guestCheckout: true, accounts: true };
  state.refresh = vi.fn(async () => {});
  state.boom = false;
  resetCartDrawerFallback();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  state.issues = []; state.isSyncing = false; state.boom = false;
  useCartStore.setState({ lines: [], mode: 'local' });
  useUiStore.setState({ cartOpen: false });
  useSessionStore.setState({ token: null, customer: null });
});

const ROOT = { title: '', description: '', chrome: 'shell' as const };
const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const p = (type: string, container = 'cc'): ComponentData => part(type, container);
const richText = (id = 'rt', html = '<p>between</p>'): ComponentData => c('RichText', id, { bodyHtml: html, width: 'narrow' });
const summaryOf = (items: ComponentData[], id = 'cs'): ComponentData => c('CartSummary', id, { items });
const DEFAULT_SUMMARY = (id = 'cs') => CART_SUMMARY_CONTAINER.defaultSlots({}, { layout: 'storefront', id }).items!;
const contents = (slots: Partial<Record<'head' | 'main' | 'summary', ComponentData[]>>, id = 'cc'): ComponentData =>
  c('CartContents', id, { head: [p('CartHeading')], main: [p('CartEmpty'), p('CartLines')], summary: [summaryOf(DEFAULT_SUMMARY())], ...slots });
const docOf = (...content: ComponentData[]): PuckDoc => ({ root: { props: ROOT }, content, zones: {} });
const guarded = (d: PuckDoc, layout: LayoutKind = 'storefront'): PuckDoc => {
  const r = validateDoc(d, 'cart', layout);
  expect(r.issues.filter((i) => !i.rule.startsWith('drop:'))).toEqual([]);
  return r.doc!;
};
const rules = (d: PuckDoc, layout: LayoutKind = 'storefront') => checkRules(d, 'cart', layout).map((i) => i.rule);
const types = (items: unknown) => (items as ComponentData[]).map((x) => x.type);

async function settle(m: { container: HTMLElement }): Promise<string> {
  let prev = '';
  for (let i = 0; i < 60; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const cur = m.container.innerHTML;
    if (cur !== '' && cur === prev) return cur;
    prev = cur;
  }
  throw new Error('never settled');
}
const renderDoc = async (doc: PuckDoc, layout: LayoutKind = 'storefront') => {
  const m = mountAt(<RenderDoc doc={guarded(doc, layout)} docKey="cart" layout={layout} />, { path: '/cart' });
  await settle(m);
  return m.container;
};

describe('contract', () => {
  it.each([...CART_PARTS, ...SUMMARY_PARTS])('%s: family, style row, text keys', (name) => {
    const def = BLOCKS[name]!;
    const row = STAGE4_PARTS[name]!;
    expect(def.part).toEqual({ family: row.family });
    expect(def.category).toBe('part');
    expect(def.style && def.style.target).toBe(row.style.target);
    expect([...(def.style ? def.style.keys : [])].sort()).toEqual([...row.style.keys].sort());
    expect((def.text ?? []).length).toBeGreaterThan(0);
  });
  it('no required part accepts hide', () => {
    for (const spec of [CART_CONTAINER, CART_SUMMARY_CONTAINER]) for (const r of spec.required) expect(BLOCKS[r]!.style && BLOCKS[r]!.style.keys, r).not.toContain('hide');
  });
  it('the containers: slots, style, text, nesting', () => {
    const cc = BLOCKS.CartContents!;
    expect(cc.slots).toEqual(['head', 'main', 'summary']);
    expect(cc.text).toEqual([]);
    expect(cc.style && cc.style.target).toBe('wrap');
    expect(cc.container).toBe(CART_CONTAINER);
    const cs = BLOCKS.CartSummary!;
    expect(cs.slots).toEqual(['items']);
    expect(cs.text).toEqual([]);
    expect(cs.style && cs.style.target).toBe('root');
    expect([...(cs.style ? cs.style.keys : [])].sort()).toEqual([...BOX].sort());
  });
  it.each(['storefront', 'menu', 'webapp'] as const)('%s: defaults pass the rules, ids are unique and short', (layout) => {
    const id = 'CartContents-default';
    const item = c('CartContents', id, CART_CONTAINER.defaultSlots({}, { layout, id }));
    expect(checkRules(docOf(item), 'cart', layout)).toEqual([]);
    const ids = JSON.stringify(item).match(/"id":"([^"]+)"/g)!.map((s) => s.slice(6, -1));
    expect(ids.every((i) => i.length <= 64)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const long = 'x'.repeat(64);
    const idsLong = JSON.stringify(c('CartContents', long, CART_CONTAINER.defaultSlots({}, { layout, id: long }))).match(/"id":"([^"]+)"/g)!.map((s) => s.slice(6, -1));
    expect(idsLong.every((i) => i.length <= 64)).toBe(true);
    expect(new Set(idsLong).size).toBe(idsLong.length);
  });
  it('a part outside its container renders nothing and does not throw', () => {
    for (const name of [...CART_PARTS, ...SUMMARY_PARTS]) {
      const view = BLOCKS[name]!.render({ id: 'x', puck: { editing: false, docKey: 'cart', layout: 'storefront' } } as never);
      const { container, unmount } = render(<>{view}</>);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });
  it('the default document is the nested arrangement', () => {
    const d = defaultDoc('cart', 'storefront')!;
    const cc = d.content[0]!;
    expect(types(cc.props.head)).toEqual(['CartHeading']);
    expect(types(cc.props.main)).toEqual(['CartEmpty', 'CartLines']);
    expect(types(cc.props.summary)).toEqual(['CartSummary']);
    expect(types((cc.props.summary as ComponentData[])[0]!.props.items)).toEqual(SUMMARY_PARTS);
    expect(checkRules(d, 'cart', 'storefront')).toEqual([]);
  });
});

describe('rules', () => {
  it.each(CART_PARTS)('removing %s => part-required', (name) => {
    const slots = { head: [p('CartHeading')], main: [p('CartEmpty'), p('CartLines')] };
    for (const k of Object.keys(slots) as ('head' | 'main')[]) slots[k] = slots[k].filter((x) => x.type !== name);
    expect(rules(docOf(contents(slots)))).toContain(`part-required:CartContents.${name}`);
  });
  it('duplicating a required part => the same rule id', () => {
    expect(rules(docOf(contents({ main: [p('CartEmpty'), p('CartLines'), c('CartLines', 'dup')] })))).toContain('part-required:CartContents.CartLines');
  });
  it.each(['CartSummarySubtotal', 'CartSummaryCheckout'])('summary: removing %s and duplicating it => part-required', (name) => {
    const items = DEFAULT_SUMMARY().filter((x) => x.type !== name);
    expect(rules(docOf(contents({ summary: [summaryOf(items)] })))).toContain(`part-required:CartSummary.${name}`);
    const dup = [...DEFAULT_SUMMARY(), c(name, 'dup')];
    expect(rules(docOf(contents({ summary: [summaryOf(dup)] })))).toContain(`part-required:CartSummary.${name}`);
  });
  it.each(['CartSummaryNotice', 'CartSummaryTerms', 'CartSummaryContinue'])('summary: a duplicated %s => part-unique', (name) => {
    const items = [...DEFAULT_SUMMARY(), c(name, 'dup')];
    expect(rules(docOf(contents({ summary: [summaryOf(items)] })))).toContain(`part-unique:CartSummary.${name}`);
  });
  it('CartLines in head (directly and inside a Section) => slot-rejects:CartContents.head', () => {
    expect(rules(docOf(contents({ head: [p('CartHeading'), c('CartLines', 'x')] })))).toContain('slot-rejects:CartContents.head');
    const section = c('Section', 'sec', { content: [c('CartLines', 'x2')] });
    expect(rules(docOf(contents({ head: [p('CartHeading'), section] })))).toContain('slot-rejects:CartContents.head');
  });
  it('CartSummary in main => slot-rejects:CartContents.main', () => {
    expect(rules(docOf(contents({ main: [p('CartEmpty'), p('CartLines'), summaryOf(DEFAULT_SUMMARY(), 'cs2')] })))).toContain('slot-rejects:CartContents.main');
  });
  it('CartEmpty in summary => slot-rejects:CartContents.summary', () => {
    expect(rules(docOf(contents({ summary: [summaryOf(DEFAULT_SUMMARY()), c('CartEmpty', 'e2')] })))).toContain('slot-rejects:CartContents.summary');
  });
  it('CartLines inside CartSummary.items => part-placement', () => {
    const items = [...DEFAULT_SUMMARY(), c('CartLines', 'l2')];
    expect(rules(docOf(contents({ summary: [summaryOf(items)] })))).toContain('part-placement:CartLines');
  });
  it('counting does not cross into the summary, and the nested summary satisfies exactly-one', () => {
    expect(rules(docOf(contents({})))).toEqual([]);
    expect(rules(docOf(contents({}), summaryOf(DEFAULT_SUMMARY(), 'cs-outside')))).toContain('exactly-one:CartSummary');
    const noNested = docOf(contents({ summary: [] }), summaryOf(DEFAULT_SUMMARY(), 'cs-outside'));
    expect(rules(noNested)).not.toContain('exactly-one:CartSummary');
  });
});

describe('upgrade of stored v0.7.0 documents', () => {
  const stored = (summary: ComponentData[]): PuckDoc => docOf(c('CartContents', 'cc', { summary }));
  it('fills absent head and main, leaves the present summary alone and fills a nested summary missing items', () => {
    const up = upgradeDoc(stored([c('CartSummary', 'cs')]), 'cart', 'storefront').content[0]!;
    expect(types(up.props.head)).toEqual(['CartHeading']);
    expect(types(up.props.main)).toEqual(['CartEmpty', 'CartLines']);
    const nested = (up.props.summary as ComponentData[])[0]!;
    expect(nested.props.id).toBe('cs');
    expect(types(nested.props.items)).toEqual(SUMMARY_PARTS);
  });
  it('a present summary slot, even empty, is untouched; present items too', () => {
    const up = upgradeDoc(stored([]), 'cart', 'storefront').content[0]!;
    expect(up.props.summary).toEqual([]);
    const kept = upgradeDoc(docOf(contents({ head: [], main: [], summary: [summaryOf([])] })), 'cart', 'storefront').content[0]!;
    expect(kept.props.head).toEqual([]);
    expect(((kept.props.summary as ComponentData[])[0]!.props.items)).toEqual([]);
  });
  it('a standalone CartSummary gets its items; the upgrade is idempotent', () => {
    const up = upgradeDoc(docOf(c('CartSummary', 'solo')), 'cart', 'storefront');
    expect(types(up.content[0]!.props.items)).toEqual(SUMMARY_PARTS);
    expect(upgradeDoc(up, 'cart', 'storefront')).toBe(up);
  });
  it('the stored shape renders v0.7.0 markup (empty cart: only the EmptyState; full: page > head, lines, foot > summary)', async () => {
    seed([]);
    let el = await renderDoc(stored([c('CartSummary', 'cs')]));
    expect(el.querySelector(`.${pageCss.page}`)).toBeNull();
    expect(el.querySelector('h2')).not.toBeNull();
    expect(el.querySelector('footer, button')).toBeNull();
    cleanup();
    seed([line(1), line(2)]);
    el = await renderDoc(stored([c('CartSummary', 'cs')]));
    const page = el.querySelector(`.${pageCss.page}`)!;
    expect([...page.children].map((x) => x.tagName + '.' + (x.className.split('_')[1] ?? ''))).toEqual(['HEADER.head', 'UL.lines', 'DIV.foot']);
    expect(page.querySelector(`.${pageCss.foot}`)!.children).toHaveLength(1);
    expect(page.querySelector(`.${pageCss.foot} > div`)!.className).toMatch(/summary/);
  });
});

describe('arrangement', () => {
  it('summary above the lines, with a RichText between lines and summary', async () => {
    seed([line(1), line(2)]);
    const doc = docOf(contents({ main: [p('CartEmpty'), richText('rt1', '<p>Free returns</p>'), p('CartLines')], summary: [summaryOf(DEFAULT_SUMMARY())] }));
    const el = await renderDoc(doc);
    const page = el.querySelector(`.${pageCss.page}`)!;
    const order = [...page.children].map((x) => (x.tagName === 'UL' ? 'lines' : x.textContent?.includes('Free returns') ? 'rich' : x.tagName === 'HEADER' ? 'head' : 'foot'));
    expect(order).toEqual(['head', 'rich', 'lines', 'foot']);
    cleanup();
    const arranged = docOf(contents({ head: [p('CartHeading')], main: [p('CartEmpty'), p('CartLines'), richText('rt2', '<p>Between</p>')], summary: [summaryOf(DEFAULT_SUMMARY())] }));
    const el2 = await renderDoc(arranged);
    const page2 = el2.querySelector(`.${pageCss.page}`)!;
    expect(page2.children[1]!.tagName).toBe('UL');
    expect(page2.children[2]!.textContent).toContain('Between');
  });
  it('summary parts reorder and a removed optional part is absent', async () => {
    seed([line(1)]);
    const items = [p('CartSummaryCheckout', 'cs'), richText('rt3', '<p>Note</p>'), p('CartSummarySubtotal', 'cs')];
    const el = await renderDoc(docOf(contents({ summary: [summaryOf(items)] })));
    const sum = el.querySelector('[class*="summary"]')!;
    expect(sum.children[0]!.tagName).toBe('A');
    expect(sum.children[1]!.textContent).toContain('Note');
    expect(sum.querySelector('[class*="ledger"]')).not.toBeNull();
    expect(sum.querySelector('[class*="keep"]')).toBeNull();
    expect(sum.querySelector('[class*="terms"]')).toBeNull();
  });
  it('a hidden optional part is absent from the DOM styling (hide attribute set)', async () => {
    seed([line(1)]);
    const items = DEFAULT_SUMMARY().map((x) => (x.type === 'CartSummaryTerms' ? { ...x, props: { ...x.props, puck: undefined, blockStyle: { hide: 'mobile' } } } : x));
    const d = docOf(contents({ summary: [summaryOf(items)] }));
    const r = validateDoc(d, 'cart', 'storefront');
    expect(r.doc).not.toBeNull();
  });
  it('CartSummary on its own, outside the cart (v0.7.0 allowed it anywhere on the document), still renders', async () => {
    seed([line(1)]);
    const el = await renderDoc(docOf(contents({ summary: [] }), summaryOf(DEFAULT_SUMMARY(), 'solo')));
    expect(el.querySelector('[class*="ledger"]')).not.toBeNull();
    expect(el.querySelector('a[href="/checkout"]')).not.toBeNull();
  });
});

describe('blocked', () => {
  it('inside contents, from the cart family: held note and a disabled checkout', async () => {
    seed([line(1), line(2)], [issue(2, { inactive: true })]);
    const el = await renderDoc(docOf(contents({})));
    expect(el.querySelector('button[class*="checkout"]:disabled')?.textContent).toContain('Checkout');
    expect(el.textContent).toMatch(/held|Remove|unavailable/i);
    expect(el.querySelector('[class*="held"]')).not.toBeNull();
  });
  it('standalone, from useServerCart', async () => {
    seed([line(1)], [issue(1, { belowMin: true, minOrderQuantity: 5 })]);
    const el = await renderDoc(docOf(contents({ summary: [] }), summaryOf(DEFAULT_SUMMARY(), 'solo')));
    expect(el.querySelector('button[class*="checkout"]:disabled')).not.toBeNull();
    expect(el.querySelector('[class*="held"]')).not.toBeNull();
  });
  it('not blocked: a live link and no held note; outOfStock alone does not block', async () => {
    seed([line(1)], [issue(1, { outOfStock: true })]);
    const el = await renderDoc(docOf(contents({})));
    expect(el.querySelector('button[class*="checkout"]:disabled')).toBeNull();
    expect(el.querySelector('a[href="/checkout"]')).not.toBeNull();
  });
  it('web app: only the held note when blocked, else nothing', async () => {
    state.features = { layout: 'webapp' };
    seed([line(1)], [issue(1, { aboveMax: true, maxOrderQuantity: 1 })]);
    let el = await renderDoc(docOf(contents({})), 'webapp');
    expect(el.querySelector('[class*="held"]')).not.toBeNull();
    expect(el.querySelector('[class*="checkout"]')).toBeNull();
    cleanup();
    seed([line(1)]);
    el = await renderDoc(docOf(contents({})), 'webapp');
    expect(el.querySelector('[class*="held"]')).toBeNull();
    expect(el.querySelector('[class*="checkout"]')).toBeNull();
  });
});

describe('refresh', () => {
  it('the page refreshes on mount', async () => {
    seed([line(1)]);
    const m = mountAt(<CartPage />, { path: '/cart' });
    await settle(m);
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });
  it('the drawer refreshes only when it opens', async () => {
    seed([line(1)]);
    const m = mountAt(<CartDrawer />, { path: '/' });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(state.refresh).not.toHaveBeenCalled();
    await act(async () => { useUiStore.setState({ cartOpen: true }); });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(m.baseElement).toBeTruthy();
  });
});

// ------------------------------------------------------------------ drawer

function pageSetWith(cart: PuckDoc | undefined): PageSet {
  return { schemaVersion: 1, shell: docOf(), pages: cart ? { cart } : {} };
}
function DrawerHarness({ pageSet, layout = 'storefront' }: { pageSet: PageSet | null; layout?: LayoutKind }) {
  return (
    <PageSetContext.Provider value={{ pageSet, layout }}>
      <CartDrawer />
      <Where />
    </PageSetContext.Provider>
  );
}
function Where() {
  return <i data-testid="where">{useLocation().pathname}</i>;
}
const mountDrawer = (pageSet: PageSet | null, open = true) => {
  useUiStore.setState({ cartOpen: open });
  return render(
    <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter initialEntries={['/']}>
      <Suspense fallback={<i data-testid="fallback" />}>
        <Routes><Route path="*" element={<DrawerHarness pageSet={pageSet} />} /></Routes>
      </Suspense>
    </MemoryRouter></MantineProvider></QueryClientProvider>,
  );
};
const drawerEl = () => document.querySelector('[data-sf-part="drawer"]') as HTMLElement | null;
const footerEl = () => drawerEl()?.querySelector('[class*="footer"]') ?? null;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe('drawer renders the cart document', () => {
  it('the default document: title, lines, and the summary in the footer; nothing suspends', async () => {
    seed([line(1), line(2)]);
    mountDrawer(null);
    await act(async () => {});
    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(drawerEl()).not.toBeNull();
    expect(drawerEl()!.querySelectorAll('li')).toHaveLength(2);
    expect(footerEl()!.textContent).toContain('Checkout');
    expect(footerEl()!.querySelector('[class*="keep"]')).not.toBeNull();
  });
  it('an arranged document (summary above the lines in main order) still keeps the summary in the footer and checkout completes', async () => {
    seed([line(1)]);
    const doc = docOf(contents({ main: [p('CartLines'), richText('rt4', '<p>Hello</p>'), p('CartEmpty')] }));
    mountDrawer(pageSetWith(doc));
    await tick();
    expect(drawerEl()!.textContent).toContain('Hello');
    expect(footerEl()!.textContent).toContain('Checkout');
    fireEvent.click(footerEl()!.querySelector('a[href="/checkout"]')!);
    await tick();
    expect(useUiStore.getState().cartOpen).toBe(false);
    expect(screen.getByTestId('where').textContent).toBe('/checkout');
  });
  it('an empty cart has no footer and the empty state closes the drawer from its button', async () => {
    seed([]);
    mountDrawer(null);
    await tick();
    expect(footerEl()).toBeNull();
    expect(drawerEl()!.querySelectorAll('li')).toHaveLength(0);
    fireEvent.click(drawerEl()!.querySelector('a[href="/"]')!);
    await tick();
    expect(useUiStore.getState().cartOpen).toBe(false);
  });
  it('a CartSummary outside CartContents renders once, in the footer', async () => {
    seed([line(1)]);
    const doc = docOf(contents({ summary: [] }), summaryOf(DEFAULT_SUMMARY(), 'outside'));
    mountDrawer(pageSetWith(doc));
    await tick();
    expect(footerEl()!.textContent).toContain('Checkout');
    expect(drawerEl()!.querySelectorAll('[class*="ledger"]')).toHaveLength(1);
    expect(document.body.querySelectorAll('[class*="ledger"]')).toHaveLength(1);
  });
  it('a CartSummary outside is not drawn when the contents carry their own', async () => {
    seed([line(1)]);
    const doc = docOf(contents({}), summaryOf(DEFAULT_SUMMARY(), 'outside'));
    mountDrawer(pageSetWith(doc));
    await tick();
    expect(document.body.querySelectorAll('[class*="ledger"]')).toHaveLength(1);
  });
  it('an empty cart with a summary outside has no footer', async () => {
    seed([]);
    mountDrawer(pageSetWith(docOf(contents({ summary: [] }), summaryOf(DEFAULT_SUMMARY(), 'outside'))));
    await tick();
    expect(footerEl()).toBeNull();
  });
  it('an empty summary slot and no outside summary: the host gets no footer', async () => {
    seed([line(1)]);
    const frame = vi.fn(({ body, footer }: { body: unknown; footer: unknown }) => <div data-has-footer={String(footer !== undefined)}>{body as never}</div>);
    const host = { surface: 'drawer' as const, dismiss: () => {}, frame };
    const slots = { head: BLOCKS.CartContents!.slots && (() => null) as never, main: (() => null) as never, summary: Object.assign(() => null, { items: [] }) as never };
    const m = mountAt(<CartHostContext.Provider value={host}><CartPage slots={slots} /></CartHostContext.Provider>, { path: '/' });
    await settle(m);
    expect(frame).toHaveBeenCalled();
    expect(m.container.querySelector('[data-has-footer]')!.getAttribute('data-has-footer')).toBe('false');
  });
  it('a published document that crashes shows the default arrangement, logged once across two opens', async () => {
    seed([line(1)]);
    // Only a route-bound block's throw reaches the document boundary; RichText is made one after the guard has accepted the document.
    const def = BLOCKS.RichText as unknown as { routeBound: boolean };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failures = () => err.mock.calls.filter((a) => a.some((x) => String(x).includes('showing the default page'))).length;
    try {
      const doc = docOf(contents({ main: [p('CartEmpty'), richText('rt5'), p('CartLines')] }));
      mountDrawer(pageSetWith(doc), false);
      await tick();
      def.routeBound = true;
      state.boom = true;
      await act(async () => { useUiStore.setState({ cartOpen: true }); });
      await tick();
      expect(failures()).toBe(1);
      expect(drawerEl()!.querySelectorAll('li')).toHaveLength(1);
      expect(footerEl()!.textContent).toContain('Checkout');
      await act(async () => { useUiStore.setState({ cartOpen: false }); });
      await tick();
      state.boom = false;
      await act(async () => { useUiStore.setState({ cartOpen: true }); });
      await tick();
      expect(failures()).toBe(1);
      expect(drawerEl()!.querySelectorAll('li')).toHaveLength(1);
      expect(drawerEl()!.textContent).not.toContain('between');
    } finally {
      def.routeBound = false;
    }
  });
  it('a document without CartContents falls back to the default one', async () => {
    seed([line(1)]);
    mountDrawer(pageSetWith(docOf(contents({ summary: [] }), summaryOf(DEFAULT_SUMMARY(), 'solo'))));
    await tick();
    expect(drawerEl()!.querySelectorAll('li')).toHaveLength(1);
  });
});

describe('legacy entry points', () => {
  it('CartSummary with explicit blocked and onNavigate keeps working', async () => {
    seed([line(1)]);
    const go = vi.fn();
    const m = mountAt(<CartSummary blocked={false} onNavigate={go} />, { path: '/cart' });
    await settle(m);
    fireEvent.click(m.container.querySelector('[class*="keep"]')!);
    expect(go).toHaveBeenCalled();
  });
  it('CartPage foot (v0.6.0) replaces the summary slot', async () => {
    seed([line(1)]);
    const m = mountAt(<CartPage foot={({ blocked, className }) => <div className={className} data-blocked={String(blocked)}>foot</div>} />, { path: '/cart' });
    await settle(m);
    expect(m.container.querySelector('[data-blocked="false"]')!.className).toMatch(/foot/);
  });
});

describe('TEXT parts read the style variables (stage 2)', () => {
  const css = (f: string) => readFileSync(resolve(__dirname, `../src/features/cart/${f}.module.css`), 'utf8');
  it('CartPage.module.css: heading, eyebrow and count', () => {
    const s = css('CartPage');
    expect(s).toMatch(/color:\s*var\(--sf-block-fg,/);
    expect(s).toMatch(/font-size:\s*calc\([^;]*var\(--sf-text-scale, 1\)/);
    for (const sel of ['eyebrow', 'title', 'sub']) {
      const body = s.match(new RegExp(`\\.${sel} \\{[^}]*\\}`))![0];
      expect(body, sel).toContain('--sf-text-scale');
      expect(body, sel).toContain('--sf-block-fg');
    }
  });
  it('CartSummary.module.css: notice, ledger label and figure, terms, keep', () => {
    const s = css('CartSummary');
    for (const sel of ['notice', 'label', 'figure', 'terms', 'keep']) {
      const body = s.match(new RegExp(`\\.${sel} \\{[^}]*\\}`))![0];
      expect(body, sel).toContain('--sf-block-fg');
    }
    for (const sel of ['notice', 'label', 'figure', 'terms', 'keep']) {
      expect(s.match(new RegExp(`\\.${sel} \\{[^}]*\\}`))![0], sel).toContain('--sf-text-scale');
    }
  });
  it('keys used here exist', () => {
    expect(BOX.length + TEXT.length + VIS.length).toBeGreaterThan(0);
    expect(partId('a', 'CartSummaryCheckout')).toBe('a-CartSummaryCheckout');
  });
});
