import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { Product } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', features: { ordering: true } }) as unknown as StorefrontSettings,
}));

import { ProductCard } from '@/features/catalog/ProductCard.tsx';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1, sku: 'SKU-1', name: 'Product', displayName: 'Product', shortDisplayName: null, description: null,
    categoryId: 1, categoryName: 'Peptides', sortOrder: 0, price: 29, inStock: true, lowStockAlert: false,
    isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [], upsellProductIds: [],
    excludedFromFreeShipping: false, imageProductId: null, provenance: null, ...overrides,
  };
}

function mount(p: Product, props: { hasSiblingImages?: boolean; index?: number } = {}) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter>
        <ProductCard product={p} {...props} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

afterEach(() => cleanup());

describe('ProductCard', () => {
  it('renders the photo well when the product has an image', () => {
    mount(product({ imageProductId: 1 }));
    expect(screen.getByRole('img', { name: 'Product' })).toBeInTheDocument();
  });

  it('renders no well at all for an image-less product in an image-less set', () => {
    const { container } = mount(product({ imageProductId: null }), { hasSiblingImages: false });
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[class*="well"]')).toBeNull();
  });

  it('keeps the empty rule-well when siblings have images, without fetching', () => {
    const { container } = mount(product({ imageProductId: null }), { hasSiblingImages: true });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[class*="well"]')).not.toBeNull();
  });

  it('animates in as a row with its index', () => {
    const { container } = mount(product(), { index: 3 });
    const card = container.querySelector('article')!;
    expect(card.className).toContain('anim-row');
    expect(card.style.getPropertyValue('--i')).toBe('3');
  });
});
