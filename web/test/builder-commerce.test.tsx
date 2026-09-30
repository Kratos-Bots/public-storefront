import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { Suspense, type ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Product } from '@/types/catalog.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', enabled: true,
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: true, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  }) as unknown as StorefrontSettings,
}));
vi.mock('@/features/checkout/CheckoutPage.tsx', () => ({ CheckoutPage: () => <p>checkout page</p> }));
vi.mock('@/features/auth/LoginPage.tsx', () => ({ LoginPage: () => <p>login page</p> }));

import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { CartPage } from '@/features/cart/CartPage.tsx';
import { useCartStore } from '@/stores/cart.ts';

const oats: Product = {
  id: 7, sku: 'NB-7', name: 'Trail Oats 1kg', displayName: 'Trail Oats 1kg', shortDisplayName: null, description: null, categoryId: 1, categoryName: 'Pantry',
  sortOrder: 0, price: 12, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null,
  pricingTiers: [], upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null, minOrderQuantity: null, maxOrderQuantity: null,
};

const wrap = (node: ReactNode) => render(<MantineProvider env="test"><MemoryRouter><Suspense fallback={<p>loading</p>}>{node}</Suspense></MemoryRouter></MantineProvider>);
const normalize = (html: string) => html.replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID').replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, 'RID');

afterEach(() => { cleanup(); useCartStore.getState().clear(); });

describe('cart default document', () => {
  it('renders the v0.6.0 cart page DOM, summary inside the foot', async () => {
    useCartStore.getState().add(oats, 2);
    const legacy = wrap(<CartPage />);
    await screen.findByRole('heading', { name: 'Your cart' });
    const expected = normalize(legacy.container.innerHTML);
    cleanup();
    const puck = wrap(<RenderDoc doc={defaultDoc('cart', 'storefront')!} docKey="cart" layout="storefront" />);
    await screen.findByRole('heading', { name: 'Your cart' });
    expect(normalize(puck.container.innerHTML)).toBe(expected);
  });
  it('the empty cart keeps its empty state and no summary', async () => {
    wrap(<RenderDoc doc={defaultDoc('cart', 'menu')!} docKey="cart" layout="menu" />);
    expect(await screen.findByText('Nothing on the order yet')).toBeInTheDocument();
  });
});

describe('checkout and login default documents', () => {
  it('render their feature pages', async () => {
    wrap(<RenderDoc doc={defaultDoc('checkout', 'webapp')!} docKey="checkout" layout="webapp" />);
    expect(await screen.findByText('checkout page')).toBeInTheDocument();
    cleanup();
    wrap(<RenderDoc doc={defaultDoc('login', 'storefront')!} docKey="login" layout="storefront" />);
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });
});
