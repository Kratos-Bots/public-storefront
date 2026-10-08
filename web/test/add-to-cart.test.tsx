import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Features, StorefrontSettings } from '@/types/settings.ts';
import type { Product } from '@/types/catalog.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
// The adornment slot, reduced to what AddToCart hands it.
vi.mock('@/templates/runtime.tsx', () => ({
  Slot: (p: { name: string; variant?: string; cta?: boolean }) => <span data-testid={`slot-${p.name}`} data-variant={p.variant} data-cta={String(p.cta)} />,
}));

import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { useCartStore } from '@/stores/cart.ts';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 7,
    sku: 'BPC-157-5MG',
    name: 'BPC-157 5mg',
    displayName: 'BPC-157 5mg',
    shortDisplayName: null, shortDescription: null,
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
    minOrderQuantity: null,
    maxOrderQuantity: null,
    ...overrides,
  };
}

function mount(p: Product, features: Partial<Features> = {}, size: 'sm' | 'lg' = 'lg') {
  state.settings = {
    currency: 'GBP',
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: true, tracking: false, wholesale: false, upsell: true, ...features },
  } as StorefrontSettings;
  return render(
    <MantineProvider env="test">
      <AddToCart product={p} size={size} showPrice={size === 'lg'} />
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
  it('flags the page / sheet CTA (lg) as a main CTA for the adornment, never the card quick-add (sm)', () => {
    state.settings = { currency: 'GBP', features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: true, tracking: false, wholesale: false, upsell: true } } as StorefrontSettings;
    const { rerender } = render(<MantineProvider env="test"><AddToCart product={product()} size="lg" /></MantineProvider>);
    expect(screen.getByTestId('slot-ButtonAdornment')).toHaveAttribute('data-cta', 'true');
    expect(screen.getByTestId('slot-ButtonAdornment')).toHaveAttribute('data-variant', 'primary');
    rerender(<MantineProvider env="test"><AddToCart product={product()} size="sm" showPrice={false} /></MantineProvider>);
    expect(screen.getByTestId('slot-ButtonAdornment')).toHaveAttribute('data-cta', 'false');
  });

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

  it('opens at the minimum order quantity, not 1', () => {
    mount(product({ minOrderQuantity: 10 }));
    fireEvent.click(button()!);
    expect(useCartStore.getState().lines).toEqual([
      expect.objectContaining({ productId: 7, quantity: 10 }),
    ]);
  });

  it('labels the button with the quantity and total when a minimum applies', () => {
    mount(product({ minOrderQuantity: 10, price: 29 }));
    expect(button()).toHaveTextContent('Add 10 · £290.00');
  });

  it('stays at 1 when there is no minimum', () => {
    mount(product({ minOrderQuantity: null }));
    expect(button()).toHaveTextContent('Add · £29.00');
  });

  it('lg: after a tap the button becomes a stepper showing the count', () => {
    mount(product());
    fireEvent.click(button()!);
    expect(screen.getByRole('group')).toHaveAccessibleName('Quantity of BPC-157 5mg in your cart');
    expect(screen.getByRole('group')).toHaveAttribute('data-sf-part', 'button');
    expect(screen.getByRole('group')).toHaveAttribute('data-variant', 'filled');
    expect(screen.getByRole('group')).toHaveTextContent('1 in cart');
    expect(screen.getByRole('button', { name: 'One fewer BPC-157 5mg' })).toBeEnabled();
  });

  it('lg: a product already in the cart renders the stepper at once', () => {
    useCartStore.setState({ lines: [{ productId: 7, displayName: 'BPC-157 5mg', sku: 'X', unitPrice: 29, basePrice: 29, pricingTiers: [], quantity: 3, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }], mode: 'local' });
    mount(product());
    expect(screen.getByRole('group')).toHaveTextContent('3 in cart');
  });

  it('+ and − change the quantity in the store', () => {
    mount(product());
    fireEvent.click(button()!);
    fireEvent.click(screen.getByRole('button', { name: 'One more BPC-157 5mg' }));
    fireEvent.click(screen.getByRole('button', { name: 'One more BPC-157 5mg' }));
    expect(useCartStore.getState().lines[0]!.quantity).toBe(3);
    expect(screen.getByRole('group')).toHaveTextContent('3 in cart');
    fireEvent.click(screen.getByRole('button', { name: 'One fewer BPC-157 5mg' }));
    expect(useCartStore.getState().lines[0]!.quantity).toBe(2);
  });

  it('− at 1 removes the line and the Add button returns', () => {
    mount(product());
    fireEvent.click(button()!);
    fireEvent.click(screen.getByRole('button', { name: 'One fewer BPC-157 5mg' }));
    expect(useCartStore.getState().lines).toEqual([]);
    expect(screen.queryByRole('group')).toBeNull();
    expect(button()).toHaveTextContent('Add · £29.00');
  });

  it('− at the minimum order quantity removes the line', () => {
    mount(product({ minOrderQuantity: 10 }));
    fireEvent.click(button()!);
    expect(screen.getByRole('group')).toHaveTextContent('10 in cart');
    fireEvent.click(screen.getByRole('button', { name: 'One fewer BPC-157 5mg' }));
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it('+ is disabled at the maximum order quantity', () => {
    mount(product({ maxOrderQuantity: 2 }));
    fireEvent.click(button()!);
    fireEvent.click(screen.getByRole('button', { name: 'One more BPC-157 5mg' }));
    expect(screen.getByRole('button', { name: 'One more BPC-157 5mg' })).toBeDisabled();
    expect(useCartStore.getState().lines[0]!.quantity).toBe(2);
  });

  it('sm with the flag off keeps the Add → Added → Add another cycle', () => {
    vi.useFakeTimers();
    mount(product(), {}, 'sm');
    fireEvent.click(button()!);
    expect(screen.queryByRole('group')).toBeNull();
    expect(button()).toHaveTextContent('Added');
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(button()).toHaveTextContent('Add another');
    fireEvent.click(button()!);
    expect(useCartStore.getState().lines[0]!.quantity).toBe(2);
  });

  it('sm with the flag on shows a compact stepper', () => {
    mount(product(), { cardStepper: true }, 'sm');
    fireEvent.click(button()!);
    const group = screen.getByRole('group');
    expect(group).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'One more BPC-157 5mg' }));
    expect(useCartStore.getState().lines[0]!.quantity).toBe(2);
  });

  it('renders nothing for ordering off, even with the product in the cart', () => {
    useCartStore.setState({ lines: [{ productId: 7, displayName: 'BPC-157 5mg', sku: 'X', unitPrice: 29, basePrice: 29, pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }], mode: 'local' });
    const { container } = mount(product(), { ordering: false });
    expect(container.querySelector('button, [role="group"]')).toBeNull();
  });

  it('an unavailable product keeps its disabled button even if it is in the cart', () => {
    useCartStore.setState({ lines: [{ productId: 7, displayName: 'BPC-157 5mg', sku: 'X', unitPrice: 29, basePrice: 29, pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }], mode: 'local' });
    mount(product({ inStock: false }));
    expect(screen.queryByRole('group')).toBeNull();
    expect(button()).toBeDisabled();
  });
});
