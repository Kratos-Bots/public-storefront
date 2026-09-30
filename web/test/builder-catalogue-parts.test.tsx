import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { Suspense } from 'react';
import type { Catalog } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import { EMPTY_ROOT, type ComponentData, type LayoutKind, type PuckDoc } from '@/builder/types.ts';
import { catalogOf, FULL, MATE, SETTINGS } from './helpers/product-fixtures.ts';
import { expectGolden } from './helpers/golden.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined, search: '' }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({ data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {} }),
}));

import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { block } from '@/builder/defaults/helpers.ts';
import { validateDoc } from '@/builder/guard.ts';
import { checkRules } from '@/builder/rules.ts';
import { BLOCKS } from '@/builder/registry.ts';
import { part } from '@/builder/parts.ts';
import { GRID_CONTAINER, LIST_CONTAINER } from '@/builder/blocks/_shared/catalogue-container.ts';

afterEach(() => { cleanup(); state.search = ''; });

const MENU = { ...SETTINGS, features: { ...SETTINGS.features, layout: 'menu' } } as StorefrontSettings;
const OVERRIDES = { categoryPicker: 'inherit', pageTitle: 'inherit', intro: 'inherit', sku: 'inherit' };
const docOf = (content: ComponentData[]): PuckDoc => ({ root: { props: { ...EMPTY_ROOT } }, content, zones: {} });
const grid = (id: string, slots: Record<string, ComponentData[]>): ComponentData => ({ type: 'ProductGrid', props: { id, ...OVERRIDES, ...slots } });
const list = (id: string, slots: Record<string, ComponentData[]>): ComponentData => ({ type: 'ProductList', props: { id, ...OVERRIDES, ...slots } });
const styled = (type: string, id: string, blockStyle: Record<string, string>): ComponentData => ({ type, props: { ...part(type, id).props, blockStyle } });

async function mount(doc: PuckDoc, layout: LayoutKind, path = '/') {
  const route = path.startsWith('/c/') ? '/c/:categorySlug' : '/';
  const out = render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Outlet context={{ search: state.search, setSearch: () => {} }} />}>
              <Route path={route} element={<Suspense fallback={null}><RenderDoc doc={doc} docKey="catalog" layout={layout} /></Suspense>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
  await screen.findAllByRole('heading', {}, { timeout: 8000 });
  return out;
}

describe('catalogue default documents = v0.7.0 goldens', () => {
  it.each([
    { name: 'grid-all', path: '/', search: '' },
    { name: 'grid-category', path: '/c/oats', search: '' },
    { name: 'grid-unknown', path: '/c/nope', search: '' },
    { name: 'grid-no-match', path: '/', search: 'zzz' },
  ])('storefront $name', { timeout: 15_000 }, async ({ name, path, search }) => {
    state.settings = SETTINGS; state.catalog = catalogOf(FULL, MATE); state.search = search;
    const { container } = await mount(defaultDoc('catalog', 'storefront')!, 'storefront', path);
    expectGolden(name, container.innerHTML);
  });
  it.each([
    { name: 'list-all', path: '/', search: '' },
    { name: 'list-category', path: '/c/oats', search: '' },
    { name: 'list-unknown', path: '/c/nope', search: '' },
    { name: 'list-no-match', path: '/', search: 'zzz' },
  ])('menu $name', async ({ name, path, search }) => {
    state.settings = MENU; state.catalog = catalogOf(FULL, MATE); state.search = search;
    const { container } = await mount(defaultDoc('catalog', 'menu')!, 'menu', path);
    expectGolden(name, container.innerHTML);
  });
  it('a v0.7.0-shaped ProductGrid (no slots) renders grid-all', async () => {
    state.settings = SETTINGS; state.catalog = catalogOf(FULL, MATE);
    const guarded = validateDoc(docOf([{ type: 'ProductGrid', props: { id: 'g', ...OVERRIDES } }]), 'catalog', 'storefront').doc!;
    const { container } = await mount(guarded, 'storefront');
    expectGolden('grid-all', container.innerHTML);
  });
});

describe('arrangements', () => {
  it('a rearranged grid without categories: noNav layout, search in the column, no filter drawer', async () => {
    state.settings = SETTINGS; state.catalog = catalogOf(FULL, MATE);
    const doc = docOf([grid('g', {
      top: [part('CatalogIntro', 'g')], rail: [],
      main: [part('CatalogSearch', 'g'), part('CatalogTitle', 'g'), part('CatalogEmpty', 'g'), part('CatalogResults', 'g')],
    })]);
    const { container, baseElement } = await mount(validateDoc(doc, 'catalog', 'storefront').doc!, 'storefront');
    const layoutDiv = container.querySelector('[class*="_layout_"]')!;
    expect(layoutDiv.className).toMatch(/_noNav_/);
    const column = layoutDiv.querySelector('[class*="_column_"]')!;
    expect(column.querySelector('input')).not.toBeNull();
    expect(container.querySelector('nav')).toBeNull();
    expect(baseElement.querySelector('.mantine-Drawer-root')).toBeNull();
  });

  it('rail accepts only categories; a second grid missing its results is reported on that grid', () => {
    const rail = GRID_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'g' });
    const bad = docOf([grid('g', { ...rail, rail: [block('Heading', {}, 'h-rail')] })]);
    expect(checkRules(bad, 'catalog', 'storefront').map((i) => i.rule)).toContain('slot-accepts:ProductGrid.rail');

    const second = GRID_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'g2' });
    const two = docOf([
      grid('g', GRID_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'g' })),
      grid('g2', { ...second, main: second.main!.filter((c) => c.type !== 'CatalogResults') }),
    ]);
    const required = checkRules(two, 'catalog', 'storefront').filter((i) => i.rule.startsWith('part-required'));
    expect(required).toHaveLength(1);
    expect(required[0]!.rule).toBe('part-required:ProductGrid.CatalogResults');
    expect(required[0]!.blockId).toBe('g2');
  });

  it('a list without its intro: no hero, the two sheets still follow the sections', async () => {
    state.settings = MENU; state.catalog = catalogOf(FULL, MATE);
    const doc = docOf([list('l', { content: [part('CatalogTitle', 'l'), part('CatalogEmpty', 'l'), part('CatalogResults', 'l')] })]);
    const { container } = await mount(validateDoc(doc, 'catalog', 'menu').doc!, 'menu');
    expect(container.textContent).not.toContain('Packed to order');
    const page = container.querySelector('[class*="_page_"]')!;
    const kids = [...page.children];
    const lastSection = kids.map((k) => k.tagName).lastIndexOf('SECTION');
    expect(lastSection).toBeGreaterThan(-1);
    const after = kids.slice(lastSection + 1);
    expect(after).toHaveLength(2);
    for (const k of after) expect(k.querySelector('.mantine-Drawer-root')).not.toBeNull();
  });

  it('wholesale: the container shows the trade list and none of its parts; blocks beside it still render', async () => {
    state.settings = { ...SETTINGS, features: { ...SETTINGS.features, wholesale: true } } as StorefrontSettings;
    state.catalog = catalogOf(FULL, MATE);
    const slots = GRID_CONTAINER.defaultSlots({}, { layout: 'storefront', id: 'g' });
    const doc = docOf([
      block('Heading', { text: 'Beside the grid' }, 'h-root'),
      grid('g', { ...slots, main: [...slots.main!, block('RichText', { bodyHtml: '<p>Inside the grid</p>' }, 'rt-in')] }),
    ]);
    const { container } = await mount(validateDoc(doc, 'catalog', 'storefront').doc!, 'storefront');
    expect(await screen.findByRole('heading', { level: 1, name: 'Trade list' })).toBeInTheDocument();
    expect(container.textContent).toContain('Beside the grid');
    expect(container.textContent).not.toContain('Inside the grid');
  });
});

describe('style per part', () => {
  const withMain = (id: string, replace: Record<string, ComponentData>) => {
    const s = GRID_CONTAINER.defaultSlots({}, { layout: 'storefront', id });
    const swap = (items: ComponentData[]) => items.map((c) => replace[c.type] ?? c);
    return grid(id, { top: swap(s.top!), rail: swap(s.rail!), main: swap(s.main!) });
  };

  it('title, search, categories and results carry their attributes', async () => {
    state.settings = SETTINGS; state.catalog = catalogOf(FULL, MATE);
    const doc = docOf([withMain('g', {
      CatalogTitle: styled('CatalogTitle', 'g', { fg: 'primary' }),
      CatalogSearch: styled('CatalogSearch', 'g', { hide: 'mobile' }),
      CatalogCategories: styled('CatalogCategories', 'g', { padTop: 'sm' }),
      CatalogResults: styled('CatalogResults', 'g', { padTop: 'sm' }),
    })]);
    const { container } = await mount(validateDoc(doc, 'catalog', 'storefront').doc!, 'storefront');
    const head = container.querySelector('h1[data-sf-part="page-title"]')!.parentElement!;
    expect(head.getAttribute('data-sf-style')).toBe('CatalogTitle');
    expect(head.getAttribute('data-sfs-fg')).toBe('primary');
    const navs = container.querySelectorAll('nav');
    expect(navs.length).toBe(2);
    for (const n of navs) {
      expect(n.getAttribute('data-sf-style')).toBe('CatalogCategories');
      expect(n.getAttribute('data-sfs-pt')).toBe('sm');
    }
    const search = container.querySelector('[data-sf-style="CatalogSearch"]')!;
    expect(search.classList.contains('mantine-TextInput-root')).toBe(true);
    expect(search.querySelector('input')).not.toBeNull();
    expect(search.getAttribute('data-sfs-hide')).toBe('mobile');
    const wrappers = container.querySelectorAll('[data-sf-style="CatalogResults"]');
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0]!.tagName).toBe('DIV');
    expect(wrappers[0]!.firstElementChild!.getAttribute('data-sf-part')).toBe('product-grid');
  });

  it('the empty state carries its attributes on an unknown category', async () => {
    state.settings = SETTINGS; state.catalog = catalogOf(FULL, MATE);
    const doc = docOf([withMain('g', { CatalogEmpty: styled('CatalogEmpty', 'g', { bg: 'surface' }) })]);
    const { container } = await mount(validateDoc(doc, 'catalog', 'storefront').doc!, 'storefront', '/c/nope');
    const root = container.querySelector('[data-sf-style="CatalogEmpty"]')!;
    expect(root.getAttribute('data-sfs-bg')).toBe('surface');
    expect(root.querySelector('h2')).not.toBeNull();
  });

  it('style keys: search takes no textSize; required parts take no hide', () => {
    const keys = (n: string) => (BLOCKS[n]!.style || { keys: [] }).keys;
    expect(keys('CatalogSearch')).not.toContain('textSize');
    for (const n of ['CatalogTitle', 'CatalogResults', 'CatalogEmpty']) expect(keys(n)).not.toContain('hide');
    expect(GRID_CONTAINER.required).toEqual(['CatalogTitle', 'CatalogResults', 'CatalogEmpty']);
    expect(LIST_CONTAINER.insertSlot).toBe('content');
    expect(GRID_CONTAINER.slotAccepts).toEqual({ rail: ['CatalogCategories'] });
  });
});
