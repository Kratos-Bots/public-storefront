import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Catalog, Category, Product } from '@/types/catalog.ts';
import type { ComponentData } from '@/builder/types.ts';

const state = vi.hoisted(() => ({ catalog: undefined as Catalog | undefined }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply' }, features: { layout: 'storefront', ordering: true, upsell: false } }) as unknown as StorefrontSettings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: () => ({ data: undefined, isPending: false, isError: false, refetch: () => {} }),
}));

import { RenderDoc } from '@/builder/render.tsx';
import { pickFeatured } from '@/builder/blocks/_shared/featured.ts';

function product(id: number, name: string, categoryId: number): Product {
  return {
    id, sku: `NB-${id}`, name, displayName: name, shortDisplayName: null, shortDescription: null, description: null, categoryId, categoryName: '',
    sortOrder: id, price: 10, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null,
    pricingTiers: [], upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: id, provenance: null, minOrderQuantity: null, maxOrderQuantity: null,
  };
}
const CATEGORIES: Category[] = [
  { id: 1, name: 'Pantry', slug: 'pantry', parentId: null, sortOrder: 0, emoji: null },
  { id: 2, name: 'Grains', slug: 'grains', parentId: 1, sortOrder: 0, emoji: null },
  { id: 3, name: 'Kit', slug: 'kit', parentId: null, sortOrder: 1, emoji: null },
];
const PRODUCTS = [product(1, 'Trail Oats 1kg', 2), product(2, 'Cold Brew Kit', 3), product(3, 'Rye Flakes', 2), product(4, 'Sea Salt', 1)];

afterEach(cleanup);

describe('pickFeatured', () => {
  it('keeps the picked order, skipping ids that left the catalogue', () => {
    expect(pickFeatured(PRODUCTS, CATEGORIES, { source: 'picked', items: [{ productId: 3 }, { productId: 99 }, { productId: 1 }], categoryId: null, limit: 4 }).map((p) => p.id)).toEqual([3, 1]);
  });
  it('takes a category including its subcategories, capped at the limit', () => {
    expect(pickFeatured(PRODUCTS, CATEGORIES, { source: 'category', items: [], categoryId: 1, limit: 2 }).map((p) => p.id)).toEqual([1, 3]);
  });
});

describe('FeaturedProducts', () => {
  it('renders product cards under its title', async () => {
    state.catalog = { categories: CATEGORIES, products: PRODUCTS };
    const content: ComponentData[] = [{ type: 'FeaturedProducts', props: { id: 'f', title: 'Staff picks', source: 'picked', items: [{ productId: 2 }], categoryId: null, limit: 4 } }];
    render(<MantineProvider env="test"><MemoryRouter><Suspense fallback={null}><RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:x" layout="storefront" /></Suspense></MemoryRouter></MantineProvider>);
    expect(await screen.findByRole('heading', { name: 'Staff picks' })).toBeInTheDocument();
    expect(await screen.findByText('Cold Brew Kit')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-sf-part="product-card"]')).toHaveLength(1);
  });
});

describe('pickFeatured dedupe', () => {
  it('keeps the first of repeated productIds', () => {
    const ps = [product(1, 'A', 1), product(2, 'B', 1)];
    const out = pickFeatured(ps, [], { source: 'picked', items: [{ productId: 1 }, { productId: 1 }, { productId: 2 }], categoryId: null, limit: 10 });
    expect(out.map((p) => p.id)).toEqual([1, 2]);
  });
});
