import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { Suspense } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Catalog, Product } from '@/types/catalog.ts';
import type { LayoutKind, PuckDoc } from '@/builder/types.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({ data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {} }),
}));

import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';

function product(id: number, name: string, extra: Partial<Product> = {}): Product {
  return {
    id, sku: `NB-${id}`, name, displayName: name, shortDisplayName: null, description: null, categoryId: 1, categoryName: 'Pantry',
    sortOrder: id, price: 12, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null,
    pricingTiers: [], upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
    minOrderQuantity: null, maxOrderQuantity: null, ...extra,
  };
}
const CATALOG: Catalog = {
  categories: [{ id: 1, name: 'Pantry', slug: 'pantry', parentId: null, sortOrder: 0, emoji: null }],
  products: [product(7, 'Trail Oats 1kg', { imageProductId: 7 }), product(8, 'Cold Brew Kit')],
};

function mount(doc: PuckDoc, layout: LayoutKind, path = '/', features: Partial<StorefrontSettings['features']> = {}) {
  state.catalog = CATALOG;
  state.settings = {
    currency: 'GBP', welcomeMessage: null,
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: '', links: { whatsapp: null, telegram: null } },
    features: { layout, ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false, ...features },
  } as StorefrontSettings;
  const docKey = path.startsWith('/p/') ? 'product' : 'catalog';
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Outlet context={{ search: '', setSearch: () => {} }} />}>
            <Route path="/" element={<Suspense fallback={<p>loading</p>}><RenderDoc doc={doc} docKey={docKey} layout={layout} /></Suspense>} />
            <Route path="/p/:id" element={<Suspense fallback={<p>loading</p>}><RenderDoc doc={doc} docKey={docKey} layout={layout} /></Suspense>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

const withProps = (doc: PuckDoc, props: Record<string, unknown>): PuckDoc => ({ ...doc, content: [{ ...doc.content[0]!, props: { ...doc.content[0]!.props, ...props } }] });

afterEach(cleanup);

describe('catalogue default documents', () => {
  it('storefront: the product grid', async () => {
    const { container } = mount(defaultDoc('catalog', 'storefront')!, 'storefront');
    expect(await screen.findByRole('heading', { level: 1, name: 'All products' }, { timeout: 30_000 })).toBeInTheDocument();
    expect(container.querySelector('[data-sf-part="product-grid"]')).not.toBeNull();
  });
  it('menu and web app: the grouped list', async () => {
    for (const layout of ['menu', 'webapp'] as const) {
      const { container } = mount(defaultDoc('catalog', layout)!, layout);
      await screen.findByRole('heading', { level: 1, name: 'All products' });
      expect(container.querySelector('[data-sf-part="group-title"]')).not.toBeNull();
      cleanup();
    }
  });
  it('wholesale mode replaces the body under any list block', async () => {
    mount(defaultDoc('catalog', 'storefront')!, 'storefront', '/', { wholesale: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Trade list' })).toBeInTheDocument();
  });
  it('a block override hides the page title for its own subtree only', async () => {
    mount(withProps(defaultDoc('catalog', 'storefront')!, { pageTitle: 'hide' }), 'storefront');
    const h1 = await screen.findByRole('heading', { level: 1, name: 'All products' });
    expect(h1).toHaveClass('sf-visually-hidden');
  });
});

describe('ProductDetail', () => {
  it('shows the gallery by default and hides it when told', async () => {
    const shown = mount(defaultDoc('product', 'storefront')!, 'storefront', '/p/7');
    await screen.findByRole('heading', { level: 1, name: 'Trail Oats 1kg' });
    expect(shown.container.querySelector('img')).not.toBeNull();
    cleanup();
    // Stage 3: the photo is the media slot's ProductGallery; an empty slot shows no photo (spec §5.1).
    const hidden = mount(withProps(defaultDoc('product', 'storefront')!, { media: [] }), 'storefront', '/p/7');
    await screen.findByRole('heading', { level: 1, name: 'Trail Oats 1kg' });
    expect(hidden.container.querySelector('img')).toBeNull();
  });
  it('the sku override beats the store-wide option', async () => {
    mount(withProps(defaultDoc('product', 'storefront')!, { sku: 'hide' }), 'storefront', '/p/7');
    await screen.findByRole('heading', { level: 1, name: 'Trail Oats 1kg' });
    expect(screen.queryByText('NB-7')).toBeNull();
  });
});
