import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Features, StorefrontSettings } from '@/types/settings.ts';
import type { Product } from '@/types/catalog.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 7, sku: 'BPC-157-5MG', name: 'BPC-157 5mg', displayName: 'BPC-157 5mg', shortDisplayName: null,
    description: null, categoryId: 1, categoryName: 'Peptides', sortOrder: 0, price: 29, inStock: true,
    lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [],
    upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
    minOrderQuantity: null, maxOrderQuantity: null, ...overrides,
  };
}

function line(overrides: Partial<LocalLine> = {}): LocalLine {
  return {
    productId: 7, displayName: 'BPC-157 5mg', sku: 'BPC-157-5MG', unitPrice: 29, basePrice: 29,
    pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
    ...overrides,
  };
}

function mount(p: Product, features: Partial<Features> = {}) {
  state.settings = {
    currency: 'GBP',
    features: {
      layout: 'menu', ordering: true, guestCheckout: false, accounts: true, verify: true,
      tracking: false, wholesale: false, upsell: true, ...features,
    },
  } as StorefrontSettings;
  return render(
    <MantineProvider env="test">
      <ProductRow product={p} onSelect={() => {}} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  useCartStore.setState({ lines: [], mode: 'local' });
});

afterEach(() => cleanup());

describe('ProductRow', () => {
  it('shows the minimum as a chip', () => {
    mount(product({ minOrderQuantity: 10 }));
    expect(screen.getByText('Min 10')).toBeInTheDocument();
  });

  it('renders no chip when there is no minimum', () => {
    mount(product());
    expect(screen.queryByText(/^Min /)).toBeNull();
  });

  it('quick-add opens the line at the minimum order quantity', () => {
    mount(product({ minOrderQuantity: 10 }));
    fireEvent.click(screen.getByRole('button', { name: 'Add BPC-157 5mg' }));
    expect(useCartStore.getState().lines).toEqual([
      expect.objectContaining({ productId: 7, quantity: 10 }),
    ]);
  });

  it('quick-add opens at 1 when there is no minimum', () => {
    mount(product());
    fireEvent.click(screen.getByRole('button', { name: 'Add BPC-157 5mg' }));
    expect(useCartStore.getState().lines).toEqual([
      expect.objectContaining({ productId: 7, quantity: 1 }),
    ]);
  });

  it('− clears the line entirely from the floor, rather than stepping below it', () => {
    useCartStore.setState({ lines: [line({ quantity: 10 })], mode: 'local' });
    mount(product({ minOrderQuantity: 10 }));
    fireEvent.click(screen.getByRole('button', { name: 'One fewer BPC-157 5mg' }));
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it('+ stops at the maximum order quantity', () => {
    useCartStore.setState({ lines: [line({ quantity: 15 })], mode: 'local' });
    mount(product({ maxOrderQuantity: 15 }));
    expect(screen.getByRole('button', { name: 'One more BPC-157 5mg' })).toBeDisabled();
  });

  it('+ still steps normally below the ceiling', () => {
    useCartStore.setState({ lines: [line({ quantity: 10 })], mode: 'local' });
    mount(product({ maxOrderQuantity: 15 }));
    fireEvent.click(screen.getByRole('button', { name: 'One more BPC-157 5mg' }));
    expect(useCartStore.getState().lines[0]!.quantity).toBe(11);
  });
});
