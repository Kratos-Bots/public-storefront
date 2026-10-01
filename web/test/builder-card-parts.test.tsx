import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { Suspense, type ReactNode } from 'react';
import type { Catalog } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { CardKey, ComponentData, LayoutKind, PuckDoc } from '@/builder/types.ts';
import { CARD_MATRIX, catalogOf, ROW_MATRIX, SETTINGS, baseProduct } from './helpers/product-fixtures.ts';
import { expectGolden } from './helpers/golden.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined, showSku: true }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({ data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {} }),
}));
vi.mock('@/templates/hooks.ts', async (orig) => {
  const real = await orig<typeof import('@/templates/hooks.ts')>();
  return { ...real, useCoreOptions: () => ({ ...real.useCoreOptions(), showSku: state.showSku }) };
});

import { ProductCard } from '@/features/catalog/ProductCard.tsx';
import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { CardDesignProvider } from '@/builder/card-design.tsx';
import { compileCard } from '@/builder/cards.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { checkRules } from '@/builder/rules.ts';
import { RenderDoc } from '@/builder/render.tsx';
import type { PageSet } from '@/builder/types.ts';

afterEach(() => { cleanup(); state.showSku = true; });

const LAYOUTS: LayoutKind[] = ['storefront', 'menu', 'webapp'];
const ROOT = { props: { title: '', description: '', chrome: 'shell' as const } };
const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });

function shell(children: ReactNode, cards?: PageSet['cards']) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<Outlet context={{ search: '', setSearch: () => {} }} />}>
              <Route path="/" element={<CardDesignProvider cards={cards} layout="storefront">{children}</CardDesignProvider>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

const tileDefault = () => defaultDoc('card:tile', 'storefront')!;
const rowDefault = () => defaultDoc('card:row', 'storefront')!;
const tileDoc = (content: ComponentData[]): PuckDoc => ({ root: ROOT, content });
const frame = (content: ComponentData[], extra: Record<string, unknown> = {}) => c('CardTile', { content, ...extra }, 'frame');
const custom = (): PuckDoc => tileDoc([frame([
  c('CardTileGroup', { kind: 'body', items: [
    c('CardTilePrice'), c('CardTileName'), c('CardTileGroup', { kind: 'foot', items: [c('CardTileAdd')] }, 'foot'),
  ] }, 'body'),
  c('CardTileImage'),
], { blockStyle: { padTop: 'sm' } })]);

describe('compiled default card = built-in card = v0.7.0 golden (spec §12)', () => {
  it.each(CARD_MATRIX)('tile $name', ({ name, product, props }) => {
    state.settings = SETTINGS;
    state.catalog = catalogOf(product);
    const { container } = shell(<ProductCard product={product} {...props} />, { tile: tileDefault() });
    expectGolden(`card-tile-${name}`, container.innerHTML);
  });
  it.each(ROW_MATRIX)('row $name', ({ name, product, index, ordering, showSku }) => {
    state.settings = { ...SETTINGS, features: { ...SETTINGS.features, ordering } } as StorefrontSettings;
    state.catalog = catalogOf(product);
    state.showSku = showSku;
    const { container } = shell(<ProductRow product={product} onSelect={() => {}} index={index} />, { row: rowDefault() });
    expectGolden(`card-row-${name}`, container.innerHTML);
  });
});

describe('two products, one design (Review Focus 3)', () => {
  it('each card shows its own name and price; the design compiles once', () => {
    state.settings = SETTINGS;
    const a = baseProduct({ id: 1, displayName: 'Trail Oats 1kg', price: 12 });
    const b = baseProduct({ id: 2, displayName: 'Trail Tin', price: 14 });
    state.catalog = catalogOf(a, b);
    const doc = tileDefault();
    const before = compileCard(doc, 'tile', 'storefront');
    const { container } = shell(<>{Array.from({ length: 500 }, (_, i) => <ProductCard key={i} product={i % 2 ? b : a} index={i} />)}</>, { tile: doc });
    const cards = container.querySelectorAll('[data-sf-part="product-card"]');
    expect(cards).toHaveLength(500);
    expect(cards[0]!.querySelector('h3')!.textContent).toBe('Trail Oats 1kg');
    expect(cards[1]!.querySelector('h3')!.textContent).toBe('Trail Tin');
    expect(cards[0]!.querySelector('[data-sf-part="price"]')!.textContent).toBe('£12.00');
    expect(cards[1]!.querySelector('[data-sf-part="price"]')!.textContent).toBe('£14.00');
    expect(compileCard(doc, 'tile', 'storefront')).toBe(before);
    expect(before).not.toBeNull();
  });
});

describe('rules on card documents', () => {
  it('an add button without the price is refused; the card falls back to built-in (golden)', () => {
    const doc = tileDoc([frame([c('CardTileName'), c('CardTileAdd')])]);
    expect(checkRules(doc, 'card:tile', 'storefront').map((i) => i.rule)).toContain('part-requires:CardTileAdd.CardTilePrice');
    expect(compileCard(doc, 'tile', 'storefront')).toBeNull();
    state.settings = SETTINGS;
    const { name, product, props } = CARD_MATRIX[0]!;
    state.catalog = catalogOf(product);
    const { container } = shell(<ProductCard product={product} {...props} />, { tile: doc });
    expectGolden(`card-tile-${name}`, container.innerHTML);
  });
  it('two frames, a foreign block, a missing name', () => {
    const f = tileDefault().content[0]!;
    expect(checkRules(tileDoc([f, { ...f, props: { ...f.props, id: 'frame-2' } }]), 'card:tile', 'storefront').map((i) => i.rule)).toContain('exactly-one:CardTile');
    expect(checkRules(tileDoc([frame([c('CardTileName'), c('Heading', { text: 'Hi' })])]), 'card:tile', 'storefront').map((i) => i.rule)).toContain('placement:Heading');
    expect(checkRules(tileDoc([frame([c('CardTilePrice')])]), 'card:tile', 'storefront').map((i) => i.rule)).toContain('part-required:CardTile.CardTileName');
  });
  it.each(LAYOUTS)('%s: the default card documents pass their own rules', (layout) => {
    for (const key of ['card:tile', 'card:row'] as CardKey[]) expect(checkRules(defaultDoc(key, layout)!, key, layout), key).toEqual([]);
  });
});

describe('custom tile design', () => {
  it('price above the name, no flags, the photo last; a styled frame carries its marker', () => {
    state.settings = SETTINGS;
    const product = baseProduct({ imageProductId: 1, lowStockAlert: true });
    state.catalog = catalogOf(product);
    const { container } = shell(<ProductCard product={product} />, { tile: custom() });
    const card = container.querySelector('article[data-sf-part="product-card"]')!;
    expect(card.getAttribute('data-sf-style')).toBe('CardTile');
    const price = card.querySelector('[data-sf-part="price"]')!;
    const link = card.querySelector('h3 a')!;
    expect(price.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.querySelector('[class*="flags"]')).toBeNull();
    expect(card.lastElementChild!.className).toMatch(/media/);
  });
});

describe('FeaturedProducts uses the design', () => {
  it('a published tile design renders in a featured block', async () => {
    state.settings = SETTINGS;
    const product = baseProduct({ id: 5, displayName: 'Cold Brew Kit', imageProductId: 5 });
    state.catalog = catalogOf(product);
    const page: PuckDoc = { root: ROOT, content: [c('FeaturedProducts', { title: 'Staff picks', source: 'picked', items: [{ productId: 5 }], categoryId: null, limit: 4 })] };
    const { container } = shell(<Suspense fallback={null}><RenderDoc doc={page} docKey="page:x" layout="storefront" /></Suspense>, { tile: custom() });
    expect(await screen.findByText('Cold Brew Kit')).toBeInTheDocument();
    const card = container.querySelector('[data-sf-part="product-card"]')!;
    const price = card.querySelector('[data-sf-part="price"]')!;
    expect(price.compareDocumentPosition(card.querySelector('h3 a')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.lastElementChild!.className).toMatch(/media/);
  });
});

describe('timing (logged, not gated)', () => {
  it('500 compiled default tiles vs 500 built-in tiles', () => {
    state.settings = SETTINGS;
    const product = baseProduct();
    state.catalog = catalogOf(product);
    const cards = () => <>{Array.from({ length: 500 }, (_, i) => <ProductCard key={i} product={product} index={i} />)}</>;
    let t = performance.now();
    shell(cards(), { tile: tileDefault() });
    const compiled = performance.now() - t;
    cleanup();
    t = performance.now();
    shell(cards());
    const builtIn = performance.now() - t;
    console.info(`[card timing] 500 compiled default tiles: ${compiled.toFixed(1)} ms; 500 built-in tiles: ${builtIn.toFixed(1)} ms`);
    expect(true).toBe(true);
  });
});
