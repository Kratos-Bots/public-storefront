import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import type { Catalog } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { ComponentData, LayoutKind, PageSet, PuckDoc } from '@/builder/types.ts';
import { EMPTY_ROOT } from '@/builder/types.ts';
import { catalogOf, FULL, MATE, SETTINGS, baseProduct } from './helpers/product-fixtures.ts';
import { expectGolden } from './helpers/golden.ts';

const state = vi.hoisted(() => ({
  settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined, showSku: true,
  mode: 'ok' as 'ok' | 'pending' | 'error',
}));
const answer = <T,>(data: T) => ({
  data: state.mode === 'ok' ? data : undefined, isPending: state.mode === 'pending', isError: state.mode === 'error', refetch: () => {},
});
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => answer(state.catalog),
  useProduct: (id: number | null) => answer(id == null ? undefined : state.catalog?.products.find((p) => p.id === id)),
}));
vi.mock('@/templates/hooks.ts', async (orig) => {
  const real = await orig<typeof import('@/templates/hooks.ts')>();
  return { ...real, useCoreOptions: () => ({ ...real.useCoreOptions(), showSku: state.showSku }) };
});

import { ProductDetailSheet } from '@/features/catalog/ProductDetailSheet.tsx';
import { PageSetContext } from '@/builder/page-set-context.ts';
import sheetChrome from '@/components/Sheet.module.css';
import sheetClasses from '@/features/catalog/ProductDetailSheet.module.css';
import pageClasses from '@/features/catalog/ProductDetailPage.module.css';

const MENU = { ...SETTINGS, features: { ...SETTINGS.features, layout: 'menu' } } as StorefrontSettings;

afterEach(() => { cleanup(); state.showSku = true; state.mode = 'ok'; document.title = ''; });

let ctx: { pageSet: PageSet | null; layout: LayoutKind } | null = null;

function wrapShell(element: ReactNode) {
  const inner = (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ search: '', setSearch: () => {} }} />}>
          <Route path="/" element={element} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  return (
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        {ctx ? <PageSetContext.Provider value={ctx}>{inner}</PageSetContext.Provider> : inner}
      </MantineProvider>
    </QueryClientProvider>
  );
}
let client = new QueryClient();
function shell(_path: string, _route: string, element: ReactNode) {
  client = new QueryClient();
  return render(wrapShell(element));
}

const c = (type: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id: `${type}-${Math.random().toString(36).slice(2, 8)}`, ...props } });
const g = (kind: string, items: ComponentData[]) => c('ProductGroup', { kind, items });
const docOf = (content: ComponentData[]): PuckDoc => ({ root: { props: { ...EMPTY_ROOT } }, content, zones: {} });
const setOf = (product: PuckDoc): PageSet => ({ schemaVersion: 1, shell: docOf([]), pages: { product } });
const detail = (main: ComponentData[], extra: Record<string, unknown> = {}) =>
  c('ProductDetail', { top: [], media: [], main, below: [], sku: 'inherit', ...extra });
const REARRANGED = () => [c('ProductBulkPricing'), g('identity', [g('identityText', [c('ProductTitle'), c('ProductStock')]), c('ProductGallery')]),
  c('ProductPrice'), c('ProductDescription'), c('ProductProvenance'), c('ProductAsk')];

const sheet = (id: number | null) => <ProductDetailSheet productId={id} onClose={() => {}} onSelect={() => {}} />;
const sheetRoot = (base: HTMLElement) => base.querySelector<HTMLElement>('[data-sf-part="sheet"]')!;
const body = (base: HTMLElement) => sheetRoot(base).querySelector<HTMLElement>(`.${sheetClasses.body}`)!;

function mount(product = FULL, withCtx: typeof ctx = null) {
  state.settings = MENU;
  state.catalog = catalogOf(product, MATE);
  ctx = withCtx;
  return shell('/', '/', sheet(product.id));
}

/** True when `a` comes before `b` in document order. */
const precedes = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('product sheet renders the layout product document (spec §7.2)', () => {
  afterEach(() => { ctx = null; });

  it('no page set: the v0.7.0 sheet, synchronously', () => {
    const { baseElement, getByRole } = mount();
    expect(getByRole('heading', { level: 2, name: FULL.displayName })).toBeTruthy();
    expectGolden('product-sheet-full', sheetRoot(baseElement).outerHTML);
    cleanup();
    state.showSku = false;
    const plain = mount(baseProduct());
    expectGolden('product-sheet-plain-nosku', sheetRoot(plain.baseElement).outerHTML);
  });

  it('a published menu product doc rearranges the body; the add button stays in the footer', () => {
    const { baseElement } = mount(FULL, { pageSet: setOf(docOf([detail(REARRANGED())])), layout: 'menu' });
    const b = body(baseElement);
    const bulk = [...b.querySelectorAll('h3')].find((h) => h.textContent === 'Buy more, pay less');
    const title = b.querySelector('[data-sf-part="sheet-title"]');
    expect(bulk).toBeTruthy();
    expect(title).toBeTruthy();
    expect(precedes(bulk!, title!)).toBe(true);
    const footer = sheetRoot(baseElement).querySelector(`.${sheetChrome.footer}`);
    expect(footer).toBeTruthy();
    expect(footer!.querySelector('button[data-variant="filled"]')).toBeTruthy();
    expect(b.querySelector('button[data-variant="filled"]')).toBeNull();
  });

  it('root content blocks render around the container', () => {
    const doc = docOf([c('Heading', { text: 'Before the product', eyebrow: '', level: 'h2', align: 'start' }), detail(REARRANGED())]);
    const { baseElement } = mount(FULL, { pageSet: setOf(doc), layout: 'menu' });
    const b = body(baseElement);
    const heading = [...b.querySelectorAll('h2')].find((h) => h.textContent === 'Before the product');
    expect(heading).toBeTruthy();
    expect(precedes(heading!, b.querySelector('[data-sf-part="sheet-title"]')!)).toBe(true);
  });

  it('a doc that breaks a rule (no ProductPrice) falls back to the default body', () => {
    const main = REARRANGED().filter((i) => i.type !== 'ProductPrice');
    const { baseElement } = mount(FULL, { pageSet: setOf(docOf([detail(main)])), layout: 'menu' });
    expectGolden('product-sheet-full', sheetRoot(baseElement).outerHTML);
  });

  it('one owner of the tab title (Review Focus 4)', () => {
    state.settings = MENU;
    state.catalog = catalogOf(FULL, MATE);
    ctx = { pageSet: setOf(docOf([detail(REARRANGED())])), layout: 'menu' };
    document.title = 'Shop';
    const writes: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title')!;
    const spy = vi.spyOn(document, 'title', 'set').mockImplementation((v: string) => { writes.push(v); desc.set!.call(document, v); });
    const { rerender } = shell('/', '/', sheet(1));
    expect(document.title).toBe('Trail Oats 1kg — Northbound Supply');
    expect(writes).toEqual(['Trail Oats 1kg — Northbound Supply']);
    rerender(wrapShell(sheet(2)));
    expect(document.title).toBe('Trail Tin — Northbound Supply');
    rerender(wrapShell(sheet(null)));
    expect(document.title).toBe('Northbound Supply');
    // cleanup + new title per change, never a second writer (the container's sheet surface sets none)
    expect(writes).toEqual(['Trail Oats 1kg — Northbound Supply', 'Northbound Supply', 'Trail Tin — Northbound Supply', 'Northbound Supply']);
    spy.mockRestore();
  });

  it('the storefront layout: the sheet ignores the storefront product page document', () => {
    const page = docOf([c('ProductDetail', {
      top: [c('ProductBreadcrumbs')], media: [c('ProductGallery')],
      main: [c('ProductTitle'), c('ProductPrice'), c('ProductAddToCart')], below: [], sku: 'inherit',
    })]);
    const { baseElement } = mount(FULL, { pageSet: setOf(page), layout: 'storefront' });
    expect(body(baseElement).querySelector(`.${pageClasses.crumbs}`)).toBeNull();
    expect(baseElement.querySelector('nav[aria-label]')).toBeNull();
    expectGolden('product-sheet-full', sheetRoot(baseElement).outerHTML);
  });
});
