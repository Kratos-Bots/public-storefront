import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Features, StorefrontSettings, Theme } from '@/types/settings.ts';
import type { Product } from '@/types/catalog.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
const putCart = vi.hoisted(() => vi.fn(() => new Promise<never>(() => {})));
vi.mock('@/api/cart.ts', () => ({ putCart, fetchCart: vi.fn(() => new Promise<never>(() => {})) }));

import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { resetCartSync, SYNC_DEBOUNCE_MS } from '@/features/cart/useServerCart.ts';
import { TemplateProvider } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { TemplateModule } from '@/templates/slots.ts';

const THEME: Theme = {
  scheme: 'dark',
  colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '',
};
const MODULE: TemplateModule = { slots: {} };

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

/** Without `options` the row renders outside any TemplateProvider (every core option shows). */
function mount(p: Product, features: Partial<Features> = {}, options?: Record<string, boolean>) {
  state.settings = {
    currency: 'GBP',
    features: {
      layout: 'menu', ordering: true, guestCheckout: false, accounts: true, verify: true,
      tracking: false, wholesale: false, upsell: true, ...features,
    },
  } as StorefrontSettings;
  const row = <ProductRow product={p} onSelect={() => {}} />;
  return render(
    <MantineProvider env="test">
      {options ? (
        <TemplateProvider
          resolved={resolveTheme({ ...THEME, options }, lookupManifest)}
          fallback={null}
          load={() => Promise.resolve(MODULE)}
          peek={() => MODULE}
        >
          {row}
        </TemplateProvider>
      ) : (
        row
      )}
    </MantineProvider>,
  );
}

beforeEach(() => {
  useCartStore.setState({ lines: [], mode: 'local' });
  resetCartSync();
  putCart.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

  // A signed-in shopper (always, inside Telegram) has a server cart: the cart page
  // adopts it on open, so a row edit that never reaches PUT /cart is thrown away.
  it('quick-add and the stepper reach the server cart for a signed-in shopper', () => {
    vi.useFakeTimers();
    useCartStore.setState({ lines: [], mode: 'server' });
    mount(product());
    fireEvent.click(screen.getByRole('button', { name: 'Add BPC-157 5mg' }));
    vi.advanceTimersByTime(SYNC_DEBOUNCE_MS);
    expect(putCart).toHaveBeenLastCalledWith([{ productId: 7, quantity: 1 }]);

    fireEvent.click(screen.getByRole('button', { name: 'One more BPC-157 5mg' }));
    vi.advanceTimersByTime(SYNC_DEBOUNCE_MS);
    expect(putCart).toHaveBeenLastCalledWith([{ productId: 7, quantity: 2 }]);
  });
});

describe('ProductRow showSku', () => {
  const meta = (container: HTMLElement) => container.querySelector('[class*="meta"]');

  it('shows the code outside a provider and with default options', () => {
    mount(product());
    expect(screen.getByText('BPC-157-5MG')).toBeInTheDocument();
    cleanup();
    const { container } = mount(product(), {}, {});
    expect(screen.getByText('BPC-157-5MG')).toBeInTheDocument();
    expect(meta(container)).not.toBeNull();
  });

  it('hidden: a plain in-stock line with no tiers or minimum has no meta line at all', () => {
    const { container } = mount(product(), {}, { showSku: false });
    expect(screen.queryByText('BPC-157-5MG')).toBeNull();
    expect(meta(container)).toBeNull();
    expect(container.querySelector('p')).toHaveAttribute('data-sf-part', 'price'); // the only <p> left
  });

  it('hidden: the meta line stays for what else it carries, without the code', () => {
    const { container } = mount(
      product({ minOrderQuantity: 10, pricingTiers: [{ id: 1, minQuantity: 20, price: 25 }] }),
      {},
      { showSku: false },
    );
    expect(meta(container)).not.toBeNull();
    expect(screen.queryByText('BPC-157-5MG')).toBeNull();
    expect(screen.getByText('Min 10')).toBeInTheDocument();
    expect(screen.getByText(/^20\+/)).toBeInTheDocument();
  });

  it.each([
    ['pre-order', { isPreorder: true }, 'Pre-order'],
    ['low stock', { lowStockAlert: true }, null],
    ['out of stock', { inStock: false }, null],
  ] as const)('hidden: a %s line keeps its meta line', (_label, overrides, text) => {
    const { container } = mount(product(overrides), {}, { showSku: false });
    expect(meta(container)).not.toBeNull();
    expect(screen.queryByText('BPC-157-5MG')).toBeNull();
    if (text) expect(screen.getByText(text)).toBeInTheDocument();
  });
});
