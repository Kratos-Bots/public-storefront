import { afterEach, describe, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import type { Catalog } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import { CARD_MATRIX, catalogOf, FULL, LEGACY_TOGGLES, MATE, ROW_MATRIX, SETTINGS, toggleName, baseProduct } from './helpers/product-fixtures.ts';
import { expectGolden } from './helpers/golden.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined, showSku: true, search: '' }));
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

import { ProductDetailPage } from '@/features/catalog/ProductDetailPage.tsx';
import { ProductDetailSheet } from '@/features/catalog/ProductDetailSheet.tsx';
import { ProductCard } from '@/features/catalog/ProductCard.tsx';
import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { ProductGrid } from '@/features/catalog/ProductGrid.tsx';
import { ProductList } from '@/features/catalog/ProductList.tsx';

afterEach(() => { cleanup(); state.showSku = true; state.search = ''; });

/** The search term arrives the way the shells hand it down: through the router outlet context. */
function shell(path: string, route: string, element: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Outlet context={{ search: state.search ?? '', setSearch: () => {} }} />}>
              <Route path={route} element={element} />
            </Route>
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe('product page (v0.7.0, sections × photo)', () => {
  it.each(LEGACY_TOGGLES.flatMap((t) => [true, false].map((photo) => ({ t, photo }))))('$t.gallery $t.bulkPricing $t.provenance $t.upsells photo=$photo', ({ t, photo }) => {
    state.settings = SETTINGS;
    state.catalog = catalogOf(photo ? FULL : { ...FULL, imageProductId: null }, MATE);
    const { container } = shell('/p/1', '/p/:id', <ProductDetailPage sections={t} />);
    expectGolden(toggleName(t, photo), container.innerHTML);
  });
});

describe('product sheet (v0.7.0)', () => {
  it.each([
    { name: 'product-sheet-full', product: FULL, showSku: true },
    { name: 'product-sheet-plain-nosku', product: baseProduct(), showSku: false },
  ])('$name', ({ name, product, showSku }) => {
    state.settings = { ...SETTINGS, features: { ...SETTINGS.features, layout: 'menu' } } as StorefrontSettings;
    state.catalog = catalogOf(product, MATE);
    state.showSku = showSku;
    const { baseElement } = shell('/', '/', <ProductDetailSheet productId={product.id} onClose={() => {}} onSelect={() => {}} />);
    expectGolden(name, baseElement.querySelector('[data-sf-part="sheet"]')!.outerHTML);
  });
});

describe('cards (v0.7.0)', () => {
  it.each(CARD_MATRIX)('tile $name', ({ name, product, props }) => {
    state.settings = SETTINGS;
    state.catalog = catalogOf(product);
    const { container } = shell('/', '/', <ProductCard product={product} {...props} />);
    expectGolden(`card-tile-${name}`, container.innerHTML);
  });
  it.each(ROW_MATRIX)('row $name', ({ name, product, index, ordering, showSku }) => {
    state.settings = { ...SETTINGS, features: { ...SETTINGS.features, ordering } } as StorefrontSettings;
    state.catalog = catalogOf(product);
    state.showSku = showSku;
    const { container } = shell('/', '/', <ProductRow product={product} onSelect={() => {}} index={index} />);
    expectGolden(`card-row-${name}`, container.innerHTML);
  });
});

describe('catalogue pages (v0.7.0)', () => {
  const imageless = baseProduct({ id: 3, displayName: 'Plain Tin', sku: 'NB-P-3' });
  it.each([
    { name: 'grid-all', path: '/', route: '/', search: '', products: [FULL, MATE] },
    { name: 'grid-category', path: '/c/oats', route: '/c/:categorySlug', search: '', products: [FULL, MATE] },
    { name: 'grid-unknown', path: '/c/nope', route: '/c/:categorySlug', search: '', products: [FULL, MATE] },
    { name: 'grid-no-match', path: '/', route: '/', search: 'zzz', products: [FULL, MATE] },
    { name: 'grid-imageless', path: '/', route: '/', search: '', products: [imageless] },
    { name: 'grid-empty', path: '/', route: '/', search: '', products: [] },
  ])('$name', ({ name, path, route, search, products }) => {
    state.settings = SETTINGS; state.catalog = catalogOf(...products); state.search = search;
    const { container } = shell(path, route, <ProductGrid />);
    expectGolden(name, container.innerHTML);
  });
  it.each([
    { name: 'list-all', path: '/', route: '/', search: '' },
    { name: 'list-category', path: '/c/oats', route: '/c/:categorySlug', search: '' },
    { name: 'list-unknown', path: '/c/nope', route: '/c/:categorySlug', search: '' },
    { name: 'list-no-match', path: '/', route: '/', search: 'zzz' },
  ])('$name', ({ name, path, route, search }) => {
    state.settings = { ...SETTINGS, features: { ...SETTINGS.features, layout: 'menu' } } as StorefrontSettings;
    state.catalog = catalogOf(FULL, MATE); state.search = search;
    const { container } = shell(path, route, <ProductList />);
    expectGolden(name, container.innerHTML);
  });
});
