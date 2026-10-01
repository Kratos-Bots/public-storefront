import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', features: { layout: 'storefront', guestCheckout: true } }) as unknown as StorefrontSettings,
}));
vi.mock('@/templates/runtime.tsx', async (orig) => ({ ...(await orig<typeof import('@/templates/runtime.tsx')>()), Slot: () => null }));

// Deliberately no import of CartPage / CartSummary: a cold page load has not loaded them.
import { CartDrawer } from '@/features/cart/CartDrawer.tsx';
import { cartViews } from '@/builder/blocks/_shared/cart-views.ts';
import { useCartStore } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';

afterEach(() => {
  cleanup();
  useUiStore.setState({ cartOpen: false });
  useCartStore.setState({ lines: [], mode: 'local' });
});

const wait = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

describe('cold load: the drawer never suspends the shell', () => {
  it('mounts closed, then opens, without ever showing a Suspense fallback', async () => {
    expect(cartViews.page).toBeNull();
    useCartStore.setState({
      lines: [{ productId: 1, displayName: 'Oat Bar', sku: 'NB-1', unitPrice: 4.5, basePrice: 4.5, pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }],
      mode: 'local',
    });
    const seen: string[] = [];
    const Probe = () => { seen.push('fallback'); return <i data-testid="fallback" />; };
    render(
      <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter>
        <Suspense fallback={<Probe />}><CartDrawer /></Suspense>
      </MemoryRouter></MantineProvider></QueryClientProvider>,
    );
    for (let i = 0; i < 100 && !(cartViews.page && cartViews.summary); i += 1) await wait();
    expect(cartViews.page).not.toBeNull();
    expect(cartViews.summary).not.toBeNull();
    await act(async () => { useUiStore.setState({ cartOpen: true }); });
    await wait();
    expect(document.querySelector('[data-sf-part="drawer"]')).not.toBeNull();
    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(seen).toEqual([]);
  });
});
