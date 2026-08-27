import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Catalog, Product } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () =>
    ({
      currency: 'GBP',
      brand: { name: 'Shop', title: 'Shop', tagline: '', links: { whatsapp: null, telegram: null } },
      features: { ordering: true, upsell: false },
    }) as unknown as StorefrontSettings,
}));

const state = vi.hoisted(() => ({ catalog: undefined as Catalog | undefined }));

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

import { ProductDetailPage } from '@/features/catalog/ProductDetailPage.tsx';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1, sku: 'SKU-1', name: 'Product', displayName: 'Product', shortDisplayName: null, description: null,
    categoryId: null, categoryName: null, sortOrder: 0, price: 29, inStock: true, lowStockAlert: false,
    isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [], upsellProductIds: [],
    excludedFromFreeShipping: false, imageProductId: null, provenance: null, ...overrides,
  };
}

function mount(p: Product) {
  state.catalog = { products: [p], categories: [] };
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[`/p/${p.id}`]}>
        <Routes>
          <Route path="/p/:id" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

afterEach(() => cleanup());

describe('ProductDetailPage', () => {
  it('drops the media column entirely for an image-less product, so .layout does not split into a blank half', () => {
    const { container } = mount(product({ imageProductId: null }));
    expect(container.querySelector('[class*="media"]')).toBeNull();
    expect(container.querySelector('[class*="layoutNoImage"]')).not.toBeNull();
  });

  it('keeps the media column and the two-up layout for a product with an image', () => {
    const { container } = mount(product({ imageProductId: 9 }));
    expect(container.querySelector('[class*="media"]')).not.toBeNull();
    expect(container.querySelector('[class*="layoutNoImage"]')).toBeNull();
  });
});
