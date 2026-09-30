import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Suspense, type ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Catalog, Product } from '@/types/catalog.ts';
import type { ComponentData } from '@/builder/types.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({ data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {} }),
}));

import { RenderDoc } from '@/builder/render.tsx';
import { ShellStateContext, useShellStateValue, useShellState } from '@/layouts/shell-context.ts';

function product(id: number, name: string, extra: Partial<Product> = {}): Product {
  return {
    id, sku: `NB-${id}`, name, displayName: name, shortDisplayName: null, description: null, categoryId: 1, categoryName: 'Pantry',
    sortOrder: id, price: 12, inStock: true, lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null,
    pricingTiers: [], upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
    minOrderQuantity: null, maxOrderQuantity: null, ...extra,
  };
}

function ShellState({ children }: { children: ReactNode }) {
  const value = useShellStateValue();
  return <ShellStateContext.Provider value={value}>{children}</ShellStateContext.Provider>;
}
function SearchEcho() { return <output>{`q=${useShellState().search}`}</output>; }

function mount(content: ComponentData[], path = '/', nested = false) {
  state.catalog = {
    categories: [{ id: 1, name: 'Pantry', slug: 'pantry', parentId: null, sortOrder: 0, emoji: null }, ...(nested ? [{ id: 2, name: 'Grains', slug: 'grains', parentId: 1, sortOrder: 0, emoji: null }] : [])],
    products: [product(7, 'Trail Oats 1kg', { upsellProductIds: [8] }), product(8, 'Cold Brew Kit')],
  };
  state.settings = {
    currency: 'GBP', welcomeMessage: 'Packed to order in Leeds',
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: 'Small batches', links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: true },
  } as StorefrontSettings;
  const page = <Suspense fallback={null}><RenderDoc doc={{ root: { props: { title: '', description: '', chrome: 'shell' } }, content }} docKey="page:x" layout="storefront" /></Suspense>;
  const router = createMemoryRouter([{ path: '/', element: <p>catalogue</p> }, { path: '*', element: page }], { initialEntries: [path] });
  return render(<MantineProvider env="test"><ShellState><RouterProvider router={router} /><SearchEcho /></ShellState></MantineProvider>);
}

const c = (type: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id: type, ...props } });

afterEach(cleanup);

describe('catalogue extras', () => {
  it('CatalogHero renders the template hero with the store copy', () => {
    mount([c('CatalogHero', { variant: 'template', surface: 'grid' })], '/pages/x');
    expect(screen.getByText('Packed to order in Leeds')).toBeInTheDocument();
    expect(screen.getByText(/2 products/)).toBeInTheDocument();
  });
  it('CategoryNav lists the categories', async () => {
    mount([c('CategoryNav')], '/pages/x');
    expect((await screen.findAllByRole('navigation', { name: 'Categories' })).length).toBeGreaterThan(0);
  });
  it('CategoryNav sits in a gutter wrapper and drops the dead All-categories button', async () => {
    const { container } = mount([c('CategoryNav')], '/pages/x', true);
    await screen.findAllByRole('navigation', { name: 'Categories' });
    const wrap = container.querySelector('[data-sf-block="CategoryNav"]');
    expect(wrap).not.toBeNull();
    expect(wrap!.className).toMatch(/wrap/);
    expect(wrap!.querySelectorAll('nav').length).toBe(2);
  });
  it('SearchField typed away from the catalogue goes to the catalogue with the query', () => {
    mount([c('SearchField', { placeholder: 'Find it' })], '/pages/x');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search products' }), { target: { value: 'oats' } });
    expect(screen.getByText('catalogue')).toBeInTheDocument();
    expect(screen.getByText('q=oats')).toBeInTheDocument();
  });
  it('Upsells follows the product in the URL', async () => {
    mount([c('Upsells', { productId: null })], '/p/7');
    expect(await screen.findByText('Cold Brew Kit')).toBeInTheDocument();
  });
  it('Upsells renders nothing without a product', () => {
    const { container } = mount([c('Upsells', { productId: null })], '/pages/x');
    expect(container.querySelector('section')).toBeNull();
  });
});
