import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { LocalLine } from '@/stores/cart.ts';
import type { ServerCartLine } from '@/types/cart.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { CartLine } from '@/features/cart/CartLine.tsx';

function line(overrides: Partial<LocalLine> = {}): LocalLine {
  return {
    productId: 7,
    displayName: 'BPC-157 5mg',
    sku: 'BPC-157-5MG',
    unitPrice: 29,
    basePrice: 29,
    pricingTiers: [],
    quantity: 1,
    isPreorder: false,
    excludedFromFreeShipping: false,
    imageProductId: null,
    ...overrides,
  };
}

function issue(overrides: Partial<ServerCartLine> = {}): ServerCartLine {
  return {
    productId: 7,
    name: 'BPC-157 5mg',
    quantity: 1,
    unitPrice: 29,
    lineTotal: 29,
    imageUrl: null,
    isPreorder: false,
    outOfStock: false,
    priceChanged: false,
    inactive: false,
    ...overrides,
  };
}

function mount(l: LocalLine, i?: ServerCartLine) {
  state.settings = { currency: 'GBP' } as StorefrontSettings;
  return render(
    <MantineProvider env="test">
      <ul>
        <CartLine line={l} issue={i} onQuantity={vi.fn()} onRemove={vi.fn()} />
      </ul>
    </MantineProvider>,
  );
}

afterEach(cleanup);

describe('CartLine', () => {
  it('strikes the base price through when a bulk break applies', () => {
    mount(line({ quantity: 5, unitPrice: 24, basePrice: 29 }));
    expect(screen.getByText('£29.00')).toBeInTheDocument(); // the struck base
    expect(screen.getByText('£24.00')).toBeInTheDocument(); // the unit in force
    expect(screen.getByText('£120.00')).toBeInTheDocument(); // 5 × 24
  });

  it('shows no struck price when the line is at the base price', () => {
    mount(line({ quantity: 2 }));
    // One £29.00 for the unit price; the line total is £58.00 — no second base figure.
    expect(screen.getAllByText('£29.00')).toHaveLength(1);
    expect(screen.getByText('£58.00')).toBeInTheDocument();
  });

  it('keeps the struck price after a server round trip', () => {
    // What `replaceFromServer` now produces for a line the store already held.
    mount(line({ quantity: 5, unitPrice: 24, basePrice: 29, pricingTiers: [{ id: 1, minQuantity: 5, price: 24 }] }));
    expect(screen.getByText('£29.00')).toBeInTheDocument();
  });

  it('chips a repriced line without blocking it', () => {
    mount(line(), issue({ priceChanged: true }));
    expect(screen.getByText('Price updated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'One more BPC-157 5mg' })).toBeInTheDocument();
  });

  it('notes an out-of-stock line but leaves the stepper', () => {
    mount(line(), issue({ outOfStock: true }));
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'One more BPC-157 5mg' })).toBeInTheDocument();
  });

  it('drops the stepper on a withdrawn line and leaves one way out', () => {
    mount(line(), issue({ inactive: true }));
    expect(screen.getByText('No longer available — remove to continue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'One more BPC-157 5mg' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Remove BPC-157 5mg' })).toHaveLength(1);
  });

  it("won't step below one — Remove is the only deletion", () => {
    mount(line());
    expect(screen.getByRole('button', { name: 'One fewer BPC-157 5mg' })).toBeDisabled();
  });

  it('renders no thumbnail for an image-less line, and one when an image is set', () => {
    const { container: noImage } = mount(line({ imageProductId: null }));
    expect(noImage.querySelector('img')).toBeNull();
    expect(noImage.querySelector('[class*="well"]')).toBeNull();

    cleanup();

    const { container: withImage } = mount(line({ imageProductId: 5 }));
    expect(withImage.querySelector('img')).not.toBeNull();
  });
});
