import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Catalog, Category, Product } from '@/types/catalog.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));

vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({
    data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id),
    isPending: false,
    isError: false,
    refetch: () => {},
  }),
}));

import { ProductGrid } from '@/features/catalog/ProductGrid.tsx';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    sku: 'SKU-1',
    name: 'Product',
    displayName: 'Product',
    shortDisplayName: null,
    description: null,
    categoryId: 1,
    categoryName: 'Peptides',
    sortOrder: 0,
    price: 29,
    inStock: true,
    lowStockAlert: false,
    isActive: true,
    isPreorder: false,
    preorderEta: null,
    pricingTiers: [],
    upsellProductIds: [],
    excludedFromFreeShipping: false,
    imageProductId: null,
    provenance: null,
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return { id: 1, name: 'Peptides', slug: 'peptides', parentId: null, sortOrder: 0, emoji: null, ...overrides };
}

const CATALOG: Catalog = {
  categories: [
    category({ id: 1, name: 'Peptides', slug: 'peptides', sortOrder: 0, emoji: '🧬' }),
    category({ id: 2, name: 'Tanning', slug: 'tanning', sortOrder: 1 }),
  ],
  products: [
    product({ id: 7, sku: 'BPC-157-5MG', displayName: 'BPC-157 5mg', categoryId: 1, sortOrder: 0 }),
    product({ id: 8, sku: 'TB-500-5MG', displayName: 'TB-500 5mg', categoryId: 1, sortOrder: 1, price: 34 }),
    product({ id: 9, sku: 'MT2-10MG', displayName: 'Melanotan II 10mg', categoryId: 2, sortOrder: 0, price: 22 }),
  ],
};

/** Stands in for `MenuShell` — `ProductList` reads the search term off the outlet context. */
function Shell() {
  return <Outlet context={{ search: '', setSearch: () => {} }} />;
}

function mount(catalog: Catalog) {
  state.catalog = catalog;
  state.settings = {
    currency: 'GBP', welcomeMessage: null,
    brand: { name: 'Shop', title: 'Shop', tagline: '', links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: true, tracking: false, wholesale: false, upsell: true },
  } as StorefrontSettings;
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<ProductGrid />} />
            <Route path="/p/:id" element={<p>product page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

afterEach(() => cleanup());

describe('ProductGrid', () => {
  it('renders the dense list when no visible product has an image', () => {
    const { container } = mount(CATALOG); // every fixture product has imageProductId: null
    expect(container.querySelector('article')).toBeNull();
    expect(container.querySelector('ul[class*="rows"]')!.querySelectorAll('li').length).toBe(3);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the card grid when at least one product has an image', () => {
    const withImage: Catalog = { ...CATALOG, products: CATALOG.products.map((p, i) => (i === 0 ? { ...p, imageProductId: p.id } : p)) };
    const { container } = mount(withImage);
    expect(container.querySelectorAll('article').length).toBe(3);
    expect(container.querySelectorAll('img').length).toBe(1);
  });

  it('opens the product page from a list row', () => {
    mount(CATALOG);
    fireEvent.click(screen.getByRole('button', { name: 'BPC-157 5mg' }));
    expect(screen.getByText('product page')).toBeInTheDocument();
  });
});
