import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import type { Features, StorefrontSettings } from '@/types/settings.ts';
import type { Catalog, Category, Product } from '@/types/catalog.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));

vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));

vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({
    data: id == null ? undefined : state.catalog?.products.find((p) => p.id === id),
    isPending: false,
    isError: false,
    refetch: () => {},
  }),
}));

import { ProductList } from '@/features/catalog/ProductList.tsx';
import { useCartStore } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    sku: 'SKU-1',
    name: 'Product',
    displayName: 'Product',
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

function category(overrides: Partial<Category> = {}): Category {
  return { id: 1, name: 'Peptides', slug: 'peptides', parentId: null, sortOrder: 0, emoji: null, ...overrides };
}

const CATALOG: Catalog = {
  categories: [
    category({ id: 1, name: 'Peptides', slug: 'peptides', sortOrder: 0, emoji: '🧬' }),
    category({ id: 2, name: 'Tanning', slug: 'tanning', sortOrder: 1 }),
  ],
  products: [
    product({ id: 7, sku: 'BPC-157-5MG', displayName: 'BPC-157 5mg', categoryId: 1, sortOrder: 0 }),
    product({ id: 8, sku: 'TB-500-5MG', displayName: 'TB-500 5mg', categoryId: 1, sortOrder: 1, price: 34 }),
    product({ id: 9, sku: 'MT2-10MG', displayName: 'Melanotan II 10mg', categoryId: 2, sortOrder: 0, price: 22 }),
  ],
};

/** Stands in for `MenuShell` — `ProductList` reads the search term off the outlet context. */
function Shell() {
  return <Outlet context={{ search: '', setSearch: () => {} }} />;
}

function mount(path = '/', features: Partial<Features> = {}, catalog: Catalog | undefined = CATALOG) {
  state.catalog = catalog;
  state.settings = {
    currency: 'GBP',
    welcomeMessage: null,
    brand: { name: 'Shop', title: 'Shop', tagline: '', links: { whatsapp: null, telegram: null } },
    features: {
      layout: 'menu',
      ordering: true,
      guestCheckout: false,
      accounts: true,
      verify: true,
      tracking: false,
      wholesale: false,
      upsell: true,
      ...features,
    },
  } as StorefrontSettings;

  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<ProductList />} />
            <Route path="/c/:categorySlug" element={<ProductList />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useCartStore.setState({ lines: [], mode: 'local' });
  useUiStore.setState({ cartOpen: false, filterOpen: false, loginOpen: false });
});

afterEach(() => {
  cleanup();
});

describe('ProductList', () => {
  it('groups the rows under one header per category', () => {
    mount();

    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent('Peptides');
    expect(groups[1]).toHaveTextContent('Tanning');

    expect(within(groups[0]!).getAllByRole('listitem')).toHaveLength(2);
    expect(within(groups[0]!).getByText('BPC-157 5mg')).toBeInTheDocument();
    expect(within(groups[0]!).getByText('TB-500 5mg')).toBeInTheDocument();

    expect(within(groups[1]!).getAllByRole('listitem')).toHaveLength(1);
    expect(within(groups[1]!).getByText('Melanotan II 10mg')).toBeInTheDocument();
  });

  it('opens the detail sheet for the product in ?p=', () => {
    mount('/?p=9');

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Melanotan II 10mg' })).toBeInTheDocument();
  });

  it('keeps the sheet closed when no ?p= is present', () => {
    mount();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('quick-adds a product that is not in the cart yet', () => {
    mount();

    fireEvent.click(screen.getByRole('button', { name: /add bpc-157 5mg/i }));

    expect(useCartStore.getState().lines).toEqual([
      expect.objectContaining({ productId: 7, quantity: 1 }),
    ]);
  });

  it('swaps the quick-add for a stepper that sets the quantity', () => {
    // Spy before mounting: the row captures the action off the store as it renders.
    const setQuantity = vi.spyOn(useCartStore.getState(), 'setQuantity');
    mount();

    fireEvent.click(screen.getByRole('button', { name: /add bpc-157 5mg/i }));
    expect(screen.queryByRole('button', { name: /add bpc-157 5mg/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /one more bpc-157 5mg/i }));
    expect(setQuantity).toHaveBeenCalledWith(7, 2);
    expect(useCartStore.getState().lines[0]!.quantity).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: /one fewer bpc-157 5mg/i }));
    expect(setQuantity).toHaveBeenLastCalledWith(7, 1);
    expect(useCartStore.getState().lines[0]!.quantity).toBe(1);

    // Down to zero drops the line and gives the quick-add its slot back.
    fireEvent.click(screen.getByRole('button', { name: /one fewer bpc-157 5mg/i }));
    expect(setQuantity).toHaveBeenLastCalledWith(7, 0);
    expect(useCartStore.getState().lines).toEqual([]);
    expect(screen.getByRole('button', { name: /add bpc-157 5mg/i })).toBeInTheDocument();

    setQuantity.mockRestore();
  });

  it('narrows to one group when a category is in the route', () => {
    mount('/c/tanning');

    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveTextContent('Tanning');
    expect(screen.queryByText('BPC-157 5mg')).toBeNull();
  });

  it('keeps a product with no category, in its own group at the end', () => {
    mount('/', {}, {
      ...CATALOG,
      products: [...CATALOG.products, product({ id: 11, sku: 'MISC-1', displayName: 'Bacteriostatic water', categoryId: null, categoryName: null })],
    });

    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(3);
    expect(groups[2]).toHaveTextContent('Uncategorised');
    expect(within(groups[2]!).getByText('Bacteriostatic water')).toBeInTheDocument();
  });

  it('renders no add controls when ordering is switched off', () => {
    mount('/', { ordering: false });
    expect(screen.queryByRole('button', { name: /add bpc-157 5mg/i })).toBeNull();
  });
});
