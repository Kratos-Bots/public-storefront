import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Features, StorefrontSettings } from '@/types/settings.ts';
import type { Product } from '@/types/catalog.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { useCartStore } from '@/stores/cart.ts';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 7,
    sku: 'BPC-157-5MG',
    name: 'BPC-157 5mg',
    displayName: 'BPC-157 5mg',
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

function mount(p: Product, features: Partial<Features> = {}) {
  state.settings = {
    currency: 'GBP',
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: true, tracking: false, wholesale: false, upsell: true, ...features },
  } as StorefrontSettings;
  return render(
    <MantineProvider env="test">
      <AddToCart product={p} />
    </MantineProvider>,
  );
}

const button = () => screen.queryByRole('button');

beforeEach(() => {
  useCartStore.setState({ lines: [], mode: 'local' });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AddToCart', () => {
  it('labels the button with the price', () => {
    mount(product());
    expect(button()).toHaveTextContent('Add · £29.00');
  });

  it('renders nothing when ordering is switched off', () => {
    mount(product(), { ordering: false });
    expect(button()).toBeNull();
  });

  it('is disabled and says why when the product is out of stock', () => {
    mount(product({ inStock: false }));
    expect(button()).toBeDisabled();
    expect(button()).toHaveTextContent('Out of stock');
  });

  it('is disabled when the product is inactive', () => {
    mount(product({ isActive: false }));
    expect(button()).toBeDisabled();
    expect(button()).toHaveTextContent('Unavailable');
  });

  it('stays enabled for an out-of-stock pre-order', () => {
    mount(product({ inStock: false, isPreorder: true }));
    expect(button()).toBeEnabled();
    expect(button()).toHaveTextContent('Pre-order · £29.00');
  });

  it('adds one to the cart', () => {
    mount(product());
    fireEvent.click(button()!);
    expect(useCartStore.getState().lines).toEqual([
      expect.objectContaining({ productId: 7, quantity: 1, unitPrice: 29 }),
    ]);
  });

  it('cycles Add → Added → Add another', () => {
    vi.useFakeTimers();
    mount(product());
    fireEvent.click(button()!);
    expect(button()).toHaveTextContent('Added');

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(button()).toHaveTextContent('Add another');

    fireEvent.click(button()!);
    expect(button()).toHaveTextContent('Added');
    expect(useCartStore.getState().lines[0]!.quantity).toBe(2);
  });
});
