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
    id: 1, sku: 'SKU-1', name: 'Product', displayName: 'Product', shortDisplayName: null, shortDescription: null, description: null,
    categoryId: null, categoryName: null, sortOrder: 0, price: 29, inStock: true, lowStockAlert: false,
    isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [], upsellProductIds: [],
    excludedFromFreeShipping: false, imageProductId: null, provenance: null,
    minOrderQuantity: null, maxOrderQuantity: null, ...overrides,
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

/** Pretends the window is (or is not) wide enough for the two-column layout; restored after each test. */
const realMatchMedia = window.matchMedia;
function setWide(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide && query.includes('48em'), media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
afterEach(() => { window.matchMedia = realMatchMedia; });

const COA = { id: 1, lab: 'Example Labs', sampleName: null, mgAmount: 10, purity: 99.9, batch: 'B-1', testDate: '1 May 2026', reportUrl: 'https://example.com/r/1', fileKey: null };

describe('ProductDetailPage lab report placement', () => {
  const heading = (c: HTMLElement) => c.querySelectorAll('#coa-heading');
  const mediaStack = (c: HTMLElement) => c.querySelector('[class*="mediaStack"]');

  it('puts an automatically placed report under the photo, once, when the columns sit side by side', () => {
    setWide(true);
    const { container } = mount(product({ imageProductId: 9, coas: [COA] }));
    expect(heading(container)).toHaveLength(1);
    const stack = mediaStack(container)!;
    expect(stack).not.toBeNull();
    expect(stack.contains(container.querySelector('#coa-heading'))).toBe(true);
    // The photo comes first, the report after it, both in the left column.
    expect(stack.querySelector('img')).not.toBeNull();
    expect(stack.firstElementChild!.compareDocumentPosition(container.querySelector('#coa-heading')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps it after the details when the layout is one column', () => {
    setWide(false);
    const { container } = mount(product({ imageProductId: 9, coas: [COA] }));
    expect(heading(container)).toHaveLength(1);
    expect(mediaStack(container)).toBeNull();
    const detail = container.querySelector('#coa-heading')!.closest('[class*="detail"]');
    expect(detail).not.toBeNull();
    // After the media column in document order, and inside the details column rather than under the photo.
    expect(container.querySelector('[class*="media"]')!.compareDocumentPosition(container.querySelector('#coa-heading')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves it with the details when the product has no photo, even on a wide window', () => {
    setWide(true);
    const { container } = mount(product({ imageProductId: null, coas: [COA] }));
    expect(heading(container)).toHaveLength(1);
    expect(mediaStack(container)).toBeNull();
  });

  it('adds nothing for a product without a report', () => {
    setWide(true);
    const { container } = mount(product({ imageProductId: 9, coas: [] }));
    expect(heading(container)).toHaveLength(0);
    expect(mediaStack(container)).toBeNull();
  });
});
