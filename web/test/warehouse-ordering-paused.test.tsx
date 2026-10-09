import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/errors.ts';
import { SETTINGS_KEY, queryClient } from '@/lib/query-client.ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
import { resetCartSync } from '@/features/cart/useServerCart.ts';
import { resetWarehouseStore, useWarehouseStore } from '@/features/warehouses/store.ts';
import { OrderingPausedNotice } from '@/features/warehouses/OrderingPausedNotice.tsx';
import { WarehouseNotice } from '@/features/warehouses/WarehouseNotice.tsx';
import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { CartSummary } from '@/features/cart/CartSummary.tsx';
import { classifyQuoteError } from '@/features/checkout/CheckoutPage.tsx';
import { DEFAULT_FORM } from '@/features/checkout/form-state.ts';
import { baseProduct } from './helpers/product-fixtures.ts';
import { useOrderingState } from '@/templates/hooks.ts';
import type { Warehouse } from '@/types/warehouses.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { LocalLine } from '@/stores/cart.ts';

const MAIN: Warehouse = { id: 1, name: 'Main', country: 'GB', isDefault: true };
const UK: Warehouse = { id: 2, name: 'UK', country: 'GB', isDefault: false, orderingEnabled: false, orderingMessage: 'Back Monday' };
const LIST = [MAIN, UK];

function settings(): StorefrontSettings {
  return {
    enabled: true,
    currency: 'GBP',
    brand: { name: 'Kratos', shortName: 'KRATOS', tagline: '', title: 'Kratos', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: true, accounts: true, verify: true, tracking: false, wholesale: false, upsell: true, warehouseSelect: true },
    access: { storefront: 'public' },
  } as unknown as StorefrontSettings;
}

function setStore(list: Warehouse[], selected: number | null) {
  useWarehouseStore.setState({ warehouseId: selected, ctx: { enabled: true, list, failed: false, carried: null } });
}

const wrap = (ui: ReactNode) => {
  queryClient.setQueryData(SETTINGS_KEY, settings());
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider env="test">
        <MemoryRouter>{ui}</MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
};

const line = (o: Partial<LocalLine> = {}): LocalLine => ({
  productId: 7, displayName: 'Assam Tea', sku: 'TEA-1', unitPrice: 12.5, basePrice: 12.5, pricingTiers: [], quantity: 2,
  isPreorder: false, excludedFromFreeShipping: false, imageProductId: null, ...o,
});

beforeEach(() => {
  localStorage.clear();
  resetWarehouseStore();
  resetCartSync();
  queryClient.clear();
  useSessionStore.getState().clear();
  useCartStore.setState({ lines: [], mode: 'local' });
});
afterEach(cleanup);

describe('OrderingPausedNotice', () => {
  it('shows the message of a single paused default warehouse, where there is no strip to hang it on', () => {
    setStore([{ ...MAIN, orderingEnabled: false, orderingMessage: 'Closed' }], null);
    wrap(<OrderingPausedNotice />);
    expect(screen.getByRole('status').textContent).toContain('Closed');
  });

  it('renders nothing with the open warehouse selected', () => {
    setStore(LIST, null);
    const { container } = wrap(<OrderingPausedNotice />);
    expect(container.querySelector('[data-warehouse-paused]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it("shows the admin's message with the paused warehouse selected", () => {
    setStore(LIST, 2);
    wrap(<OrderingPausedNotice />);
    expect(screen.getByRole('status').textContent).toContain('Back Monday');
  });

  it('falls back to the shop-wide sentence naming the warehouse when there is no message', () => {
    setStore([MAIN, { ...UK, orderingMessage: null }], 2);
    wrap(<OrderingPausedNotice />);
    expect(screen.getByRole('status').textContent).toBe('UK is not taking orders right now. You can browse, or choose another warehouse.');
  });
});

describe('AddToCart while ordering is paused', () => {
  const add = () => screen.queryByRole('button', { name: /add/i });

  it('has no add control for a single paused default warehouse', () => {
    setStore([{ ...MAIN, orderingEnabled: false, orderingMessage: 'Closed' }], null);
    wrap(<AddToCart product={baseProduct()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('keeps its add button with the open warehouse selected', () => {
    setStore(LIST, null);
    wrap(<AddToCart product={baseProduct()} />);
    expect(add()).not.toBeNull();
  });

  it('has no add control with the paused warehouse selected', () => {
    setStore(LIST, 2);
    wrap(<AddToCart product={baseProduct()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('the cart while ordering is paused', () => {
  const checkoutLinks = () => document.querySelectorAll('a[href^="/checkout"], a[href*="checkout"]');
  const enabledCheckout = () => screen.queryAllByRole('button', { name: /checkout/i }).filter((b) => !(b as HTMLButtonElement).disabled);

  it('offers checkout with the open warehouse selected', () => {
    setStore(LIST, null);
    useCartStore.setState({ lines: [line()], mode: 'local' });
    wrap(<CartSummary />);
    expect(checkoutLinks().length).toBe(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the notice and no way to /checkout with the paused warehouse selected, and keeps the subtotal', () => {
    setStore(LIST, 2);
    useCartStore.setState({ lines: [line()], mode: 'local' });
    wrap(<CartSummary />);
    expect(screen.getByRole('status').textContent).toContain('Back Monday');
    expect(checkoutLinks()).toHaveLength(0);
    expect(enabledCheckout()).toHaveLength(0);
    expect(screen.getByText('£25.00')).toBeInTheDocument();
  });
});

describe('classifyQuoteError', () => {
  it('treats the paused-warehouse 503 as a page-level error, not a field error', () => {
    expect(classifyQuoteError(new ApiError(503, 'WAREHOUSE_ORDERING_PAUSED'), DEFAULT_FORM)).toBeNull();
  });
});

describe('header notice and cart notice together', () => {
  const header = () => (
    <>
      <WarehouseNotice />
    </>
  );
  const notices = () => document.querySelectorAll('[data-warehouse-paused]');

  it('shows in the header when no cart notice is mounted (a cart with its checkout part hidden)', () => {
    setStore(LIST, 2);
    wrap(header());
    expect(notices()).toHaveLength(1);
  });

  it('shows exactly one notice, the cart\'s, when both are mounted, and the header returns when the cart notice goes', () => {
    setStore(LIST, 2);
    const ui = (cart: boolean) => (
      <>
        <WarehouseNotice />
        {cart ? <OrderingPausedNotice variant="inline" /> : null}
      </>
    );
    const { rerender } = wrap(ui(true));
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.className).toMatch(/inline/);
    rerender(
      <QueryClientProvider client={queryClient}>
        <MantineProvider env="test">
          <MemoryRouter>{ui(false)}</MemoryRouter>
        </MantineProvider>
      </QueryClientProvider>,
    );
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.className).toMatch(/bar/);
  });

  it('renders neither, and no wrapper, when ordering is not paused', () => {
    setStore(LIST, null);
    const { container } = wrap(
      <>
        <WarehouseNotice />
        <OrderingPausedNotice variant="inline" />
      </>,
    );
    expect(notices()).toHaveLength(0);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('useOrderingState().accepting', () => {
  function Probe() {
    const { ordering, accepting } = useOrderingState();
    return <p data-testid="ordering-state">{`ordering=${ordering} accepting=${accepting}`}</p>;
  }
  const state = () => screen.getByTestId('ordering-state').textContent;

  it('is true with the open default warehouse selected', () => {
    setStore(LIST, null);
    wrap(<Probe />);
    expect(state()).toBe('ordering=true accepting=true');
  });

  it('is false with the paused warehouse selected, while ordering stays true', () => {
    setStore(LIST, 2);
    wrap(<Probe />);
    expect(state()).toBe('ordering=true accepting=false');
  });

  it('is true with the warehouse feature off, even if the list holds a paused warehouse', () => {
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: false, list: LIST, failed: false, carried: null } });
    wrap(<Probe />);
    expect(state()).toBe('ordering=true accepting=true');
  });
});
