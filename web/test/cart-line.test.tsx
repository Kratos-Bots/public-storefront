import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { LocalLine } from '@/stores/cart.ts';
import type { ServerCartLine } from '@/types/cart.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

import { CartLine } from '@/features/cart/CartLine.tsx';
import { useCartStore } from '@/stores/cart.ts';

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
    belowMin: false,
    aboveMax: false,
    minOrderQuantity: null,
    maxOrderQuantity: null,
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

afterEach(() => {
  cleanup();
  useCartStore.setState({ lines: [], mode: 'local' });
});

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

  it('flags a below-minimum line with a one-tap fix, and leaves the stepper', () => {
    mount(
      line({ quantity: 4 }),
      issue({ quantity: 4, belowMin: true, minOrderQuantity: 10 }),
    );
    expect(screen.getByText('Minimum 10 per order')).toBeInTheDocument();
    const fix = screen.getByRole('button', { name: 'Set to 10' });
    expect(screen.getByRole('button', { name: 'One more BPC-157 5mg' })).toBeInTheDocument();
    fireEvent.click(fix);
  });

  it('flags an above-maximum line with a one-tap fix', () => {
    mount(
      line({ quantity: 60 }),
      issue({ quantity: 60, aboveMax: true, maxOrderQuantity: 50 }),
    );
    expect(screen.getByText('Maximum 50 per order')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set to 50' })).toBeInTheDocument();
  });

  it('the fix button sets the quantity to the limit', () => {
    const onQuantity = vi.fn();
    render(
      <MantineProvider env="test">
        <ul>
          <CartLine
            line={line({ quantity: 4 })}
            issue={issue({ quantity: 4, belowMin: true, minOrderQuantity: 10 })}
            onQuantity={onQuantity}
            onRemove={vi.fn()}
          />
        </ul>
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set to 10' }));
    expect(onQuantity).toHaveBeenCalledWith(7, 10);
  });

  it('clamps the stepper at the resolved minimum once a line is flagged below it', () => {
    mount(
      line({ quantity: 4 }),
      issue({ quantity: 4, belowMin: true, minOrderQuantity: 10 }),
    );
    expect(screen.getByRole('button', { name: 'One fewer BPC-157 5mg' })).toBeDisabled();
  });

  it('clamps the stepper at the resolved maximum once a line is flagged above it', () => {
    mount(
      line({ quantity: 60 }),
      issue({ quantity: 60, aboveMax: true, maxOrderQuantity: 50 }),
    );
    expect(screen.getByRole('button', { name: 'One more BPC-157 5mg' })).toBeDisabled();
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

describe('CartLine and the shop-wide unit limit', () => {
  const seed = (limit: number | null, quantities: number[]) => {
    useCartStore.setState({ lines: quantities.map((q, i) => line({ productId: 7 + i, quantity: q })), mode: 'local' });
    state.settings = { currency: 'GBP', limits: { maxOrderUnits: limit } } as unknown as StorefrontSettings;
  };
  const mountWith = (l: LocalLine, onQuantity = vi.fn(), onRemove = vi.fn()) => {
    render(
      <MantineProvider env="test">
        <ul>
          <CartLine line={l} onQuantity={onQuantity} onRemove={onRemove} />
        </ul>
      </MantineProvider>,
    );
    return { onQuantity, onRemove };
  };

  it('disables + on a line when the cart is at the limit (limit 3, lines 2 + 1)', () => {
    seed(3, [2, 1]);
    mountWith(line({ productId: 7, quantity: 2 }));
    expect(screen.getByRole('button', { name: 'One more BPC-157 5mg' })).toBeDisabled();
    cleanup();
    mountWith(line({ productId: 8, quantity: 1 }));
    expect(screen.getByRole('button', { name: 'One more BPC-157 5mg' })).toBeDisabled();
  });

  it('keeps + enabled while there is headroom (limit 4, lines 2 + 1)', () => {
    seed(4, [2, 1]);
    const { onQuantity } = mountWith(line({ productId: 7, quantity: 2 }));
    const more = screen.getByRole('button', { name: 'One more BPC-157 5mg' });
    expect(more).toBeEnabled();
    fireEvent.click(more);
    expect(onQuantity).toHaveBeenCalledWith(7, 3);
  });

  it('an over-limit cart can still be stepped down and the line removed, but not up', () => {
    seed(3, [3, 2]);
    const { onQuantity, onRemove } = mountWith(line({ productId: 7, quantity: 3 }));
    expect(screen.getByRole('button', { name: 'One more BPC-157 5mg' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'One fewer BPC-157 5mg' }));
    expect(onQuantity).toHaveBeenCalledWith(7, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove BPC-157 5mg' }));
    expect(onRemove).toHaveBeenCalledWith(7);
  });

  it('a typed quantity is clamped to the headroom', () => {
    seed(5, [2, 1]);
    const { onQuantity } = mountWith(line({ productId: 7, quantity: 2 }));
    fireEvent.change(screen.getByRole('textbox', { name: /BPC-157 5mg/ }), { target: { value: '9' } });
    expect(onQuantity).toHaveBeenCalledWith(7, 4);
  });

  it('without an order limit a typed value above the product max is not clamped (aboveMax flow stays reachable)', () => {
    seed(null, [10]);
    const onQuantity = vi.fn();
    render(
      <MantineProvider env="test">
        <ul>
          <CartLine line={line({ productId: 7, quantity: 10 })} issue={issue({ quantity: 10, maxOrderQuantity: 15 })} onQuantity={onQuantity} onRemove={vi.fn()} />
        </ul>
      </MantineProvider>,
    );
    fireEvent.change(screen.getByRole('textbox', { name: /BPC-157 5mg/ }), { target: { value: '20' } });
    expect(onQuantity).toHaveBeenCalledWith(7, 20);
  });

  it('on an over-limit cart a larger typed number leaves the quantity unchanged and a smaller one is accepted', () => {
    seed(3, [3, 2]);
    const { onQuantity } = mountWith(line({ productId: 7, quantity: 3 }));
    const box = screen.getByRole('textbox', { name: /BPC-157 5mg/ });
    fireEvent.change(box, { target: { value: '9' } });
    expect(onQuantity).toHaveBeenLastCalledWith(7, 3);
    fireEvent.change(box, { target: { value: '1' } });
    expect(onQuantity).toHaveBeenLastCalledWith(7, 1);
  });

  it('no limit leaves the stepper alone', () => {
    seed(null, [40]);
    mountWith(line({ productId: 7, quantity: 40 }));
    expect(screen.getByRole('button', { name: 'One more BPC-157 5mg' })).toBeEnabled();
  });
});
