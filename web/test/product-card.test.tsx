import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { Product } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', features: { ordering: true } }) as unknown as StorefrontSettings,
}));

import { ProductCard, TILE_VIEWS } from '@/features/catalog/ProductCard.tsx';
import { CardTileFamily } from '@/builder/families.ts';
import { resetWarehouseStore, useWarehouseStore } from '@/features/warehouses/store.ts';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1, sku: 'SKU-1', name: 'Product', displayName: 'Product', shortDisplayName: null, shortDescription: null, description: null,
    categoryId: 1, categoryName: 'Peptides', sortOrder: 0, price: 29, inStock: true, lowStockAlert: false,
    isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [], upsellProductIds: [],
    excludedFromFreeShipping: false, imageProductId: null, provenance: null,
    minOrderQuantity: null, maxOrderQuantity: null, ...overrides,
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

// Ordering paused at the selected warehouse: the price takes the Add button's slot.
describe('ProductCard while ordering is paused', () => {
  const pause = (selected: number | null = 2) =>
    useWarehouseStore.setState({
      warehouseId: selected,
      ctx: {
        enabled: true, failed: false, carried: null,
        list: [{ id: 1, name: 'Main', country: 'GB', isDefault: true }, { id: 2, name: 'UK', country: 'GB', isDefault: false, orderingEnabled: false, orderingMessage: 'Back Monday' }],
      },
    });
  const prices = (c: HTMLElement) => c.querySelectorAll('[data-sf-part="price"]');
  const emptyBoxes = (c: HTMLElement) => [...c.querySelectorAll('div')].filter((d) => d.children.length === 0 && !d.textContent && !d.hasAttribute('aria-hidden'));

  beforeEach(() => resetWarehouseStore());
  afterEach(() => resetWarehouseStore());

  it('has the price once, in the add slot, with no button and no empty box', () => {
    pause();
    const { container } = mount(product({ pricingTiers: [{ id: 1, minQuantity: 5, price: 24 }] }));
    expect(prices(container)).toHaveLength(1);
    expect(prices(container)[0]!.closest('div')!.className).toMatch(/addPrice/);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(emptyBoxes(container)).toHaveLength(0);
    expect(screen.getByText(/^5\+/)).toBeInTheDocument(); // the bulk rung still shows
  });

  it('is unchanged with the open warehouse selected: price in the foot, the button after it', () => {
    pause(null);
    const { container } = mount(product());
    expect(prices(container)).toHaveLength(1);
    expect(prices(container)[0]!.closest('div')!.className).not.toMatch(/addPrice/);
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });

  const view = (name: 'CardTilePrice' | 'CardTileAdd', hasAddPart?: boolean) => {
    const View = TILE_VIEWS[name]!;
    return render(
      <MantineProvider env="test">
        <MemoryRouter>
          <CardTileFamily.Provider value={{ data: { product: product(), eager: false, hasSiblingImages: true, hasAddPart }, views: TILE_VIEWS }}>
            <View props={{}} />
          </CardTileFamily.Provider>
        </MemoryRouter>
      </MantineProvider>,
    );
  };

  it('an Add part without a Price part still shows the price; a Price part without an Add part keeps it', () => {
    pause();
    expect(prices(view('CardTileAdd', true).container)).toHaveLength(1);
    cleanup();
    expect(prices(view('CardTilePrice', false).container)).toHaveLength(1);
    cleanup();
    expect(prices(view('CardTilePrice', true).container)).toHaveLength(0);
  });
});
