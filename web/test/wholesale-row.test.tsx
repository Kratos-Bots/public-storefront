import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Product } from '@/types/catalog.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { WholesaleRow } from '@/features/wholesale/WholesaleRow.tsx';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 7, sku: 'BPC-157-5MG', name: 'BPC-157 5mg', displayName: 'BPC-157 5mg', shortDisplayName: null,
    description: null, categoryId: 1, categoryName: 'Peptides', sortOrder: 0, price: 20, inStock: true,
    lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [],
    upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
    minOrderQuantity: null, maxOrderQuantity: null, ...overrides,
  };
}

function line(overrides: Partial<LocalLine> = {}): LocalLine {
  return {
    productId: 7, displayName: 'BPC-157 5mg', sku: 'BPC-157-5MG', unitPrice: 20, basePrice: 20,
    pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
    ...overrides,
  };
}

function mount(p: Product) {
  state.settings = { currency: 'GBP' } as StorefrontSettings;
  return render(
    <MantineProvider env="test">
      <table>
        <WholesaleRow product={p} band={false} groupEnd={false} ordering />
      </table>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useCartStore.setState({ lines: [], mode: 'local' });
});

afterEach(() => cleanup());

describe('WholesaleRow', () => {
  it('shows the minimum as a chip', () => {
    mount(product({ minOrderQuantity: 10 }));
    expect(screen.getByText('Min 10')).toBeInTheDocument();
  });

  it('+ from empty opens the line at the minimum order quantity', () => {
    mount(product({ minOrderQuantity: 10 }));
    fireEvent.click(screen.getByRole('button', { name: 'One more BPC-157 5mg' }));
    expect(useCartStore.getState().lines).toEqual([
      expect.objectContaining({ productId: 7, quantity: 10 }),
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

  it('typing a below-floor value clamps up to the minimum on blur', () => {
    useCartStore.setState({ lines: [line({ quantity: 12 })], mode: 'local' });
    mount(product({ minOrderQuantity: 10 }));
    const input = screen.getByRole('textbox', { name: 'BPC-157 5mg quantity' });
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);
    expect(useCartStore.getState().lines[0]!.quantity).toBe(10);
  });

  it('typing an above-max value clamps down to the maximum on blur', () => {
    useCartStore.setState({ lines: [line({ quantity: 12 })], mode: 'local' });
    mount(product({ maxOrderQuantity: 15 }));
    const input = screen.getByRole('textbox', { name: 'BPC-157 5mg quantity' });
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    expect(useCartStore.getState().lines[0]!.quantity).toBe(15);
  });

  it('pressing Enter commits the clamp the same way blur does', () => {
    useCartStore.setState({ lines: [line({ quantity: 12 })], mode: 'local' });
    mount(product({ minOrderQuantity: 10 }));
    const input = screen.getByRole('textbox', { name: 'BPC-157 5mg quantity' });
    input.focus();
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useCartStore.getState().lines[0]!.quantity).toBe(10);
  });
});
