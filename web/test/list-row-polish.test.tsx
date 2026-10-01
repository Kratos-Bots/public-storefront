import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import type { Catalog, Category, Product } from '@/types/catalog.ts';
import type { StorefrontSettings, Theme } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: () => ({ data: undefined, isPending: false, isError: false, refetch: () => {} }),
}));

import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { ProductCard } from '@/features/catalog/ProductCard.tsx';
import { ProductList } from '@/features/catalog/ProductList.tsx';
import { CategoryNav } from '@/features/catalog/CategoryNav.tsx';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
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
const LONG = 'Trail Mix 500g (Almond + Cashew + Cranberry) x 6 Packs';

function product(o: Partial<Product> = {}): Product {
  return {
    id: 7, sku: 'NB-MIX-7', name: LONG, displayName: LONG, shortDisplayName: null, shortDescription: null,
    description: null, categoryId: 1, categoryName: 'Pantry', sortOrder: 0, price: 29, inStock: true,
    lowStockAlert: false, isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [],
    upsellProductIds: [], excludedFromFreeShipping: false, imageProductId: null, provenance: null,
    minOrderQuantity: null, maxOrderQuantity: null, ...o,
  };
}

function settings() {
  state.settings = {
    currency: 'GBP', welcomeMessage: null,
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: '', links: { whatsapp: null, telegram: null } },
    features: { layout: 'menu', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  } as unknown as StorefrontSettings;
}

function wrap(node: ReactNode, options: Record<string, boolean> = {}) {
  settings();
  return render(
    <MantineProvider env="test">
      <TemplateProvider resolved={resolveTheme({ ...THEME, options }, lookupManifest)} fallback={null} load={() => Promise.resolve(MODULE)} peek={() => MODULE}>
        <MemoryRouter>{node}</MemoryRouter>
      </TemplateProvider>
    </MantineProvider>,
  );
}

const row = (p: Product, options?: Record<string, boolean>) => wrap(<ProductRow product={p} onSelect={() => {}} />, options);
const card = (p: Product, options?: Record<string, boolean>) => wrap(<ProductCard product={p} />, options);

afterEach(() => cleanup());

describe('short description', () => {
  const DESC = 'Roasted in small batches.';

  it('row: renders under the name when set, outside the heading and the tap target', () => {
    const { container } = row(product({ shortDescription: DESC }));
    const text = screen.getByText(DESC);
    expect(text.tagName).toBe('P');
    expect(text.closest('h3')).toBeNull();
    const heading = container.querySelector('h3')!;
    expect(heading.nextElementSibling).toBe(text);
  });

  it.each([null, undefined])('row: nothing extra when %s', (v) => {
    const a = row(product({ shortDescription: v as null })).container.innerHTML;
    cleanup();
    const b = row(product()).container.innerHTML;
    expect(a).toBe(b);
    expect(a).not.toContain('Roasted');
  });

  it('row: absent field renders exactly like null', () => {
    const p = product();
    delete (p as Partial<Product>).shortDescription;
    const a = row(p).container.innerHTML;
    cleanup();
    expect(row(product({ shortDescription: null })).container.innerHTML).toBe(a);
  });

  it('card: renders when set and not when null/undefined', () => {
    const { container } = card(product({ shortDescription: DESC }));
    expect(screen.getByText(DESC)).toBeInTheDocument();
    expect(container.querySelector('h3')!.nextElementSibling).toBe(screen.getByText(DESC));
    cleanup();
    const a = card(product({ shortDescription: null })).container.innerHTML;
    cleanup();
    const p = product();
    delete (p as Partial<Product>).shortDescription;
    expect(card(p).container.innerHTML).toBe(a);
  });
});

describe('showOutOfStockPrice', () => {
  const OUT = { inStock: false };
  const price = (c: HTMLElement) => c.querySelector('[data-sf-part="price"]');

  it('row, default: price shown and the chip stays in the meta line', () => {
    const { container } = row(product(OUT));
    expect(price(container)).toHaveTextContent('£29.00');
    expect(screen.getAllByText('Out of Stock')).toHaveLength(1);
    expect(container.querySelector('p[class*="meta"]')).toContainElement(screen.getByText('Out of Stock'));
  });

  it('row, off: out of stock replaces the price and the meta chip goes', () => {
    const { container } = row(product(OUT), { showOutOfStockPrice: false, showSku: false });
    const slot = container.querySelector('[data-sf-part="price"]')!;
    expect(slot).toHaveTextContent('Out of Stock');
    expect(slot).not.toHaveTextContent('£');
    expect(screen.getAllByText('Out of Stock')).toHaveLength(1);
    // The chip was the meta line's only content, so the line disappears.
    expect(container.querySelector('p[class*="meta"]')).toBeNull();
  });

  it('row, off: other meta content stays, only the duplicate chip drops', () => {
    const { container } = row(product({ ...OUT, minOrderQuantity: 4 }), { showOutOfStockPrice: false, showSku: false });
    const meta = container.querySelector('p[class*="meta"]')!;
    expect(within(meta as HTMLElement).getByText('Min 4')).toBeInTheDocument();
    expect(within(meta as HTMLElement).queryByText('Out of Stock')).toBeNull();
  });

  it.each([
    ['in stock', {}],
    ['low stock', { lowStockAlert: true }],
    ['preorder', { inStock: false, isPreorder: true }],
  ])('row, off: %s keeps its price', (_n, o) => {
    const { container } = row(product(o), { showOutOfStockPrice: false });
    expect(price(container)).toHaveTextContent('£29.00');
  });

  it('row, off: low stock keeps its chip in the meta line', () => {
    row(product({ lowStockAlert: true }), { showOutOfStockPrice: false });
    expect(screen.getByText('Low Stock')).toBeInTheDocument();
  });

  it('card, off: out of stock replaces the price and the flags chip goes', () => {
    const { container } = card(product(OUT), { showOutOfStockPrice: false });
    expect(container.querySelector('[data-sf-part="price"]')).toHaveTextContent('Out of Stock');
    expect(screen.getAllByText('Out of Stock')).toHaveLength(1);
    expect(container.querySelector('[class*="flags"]')).toBeNull();
  });

  it('card, default and in-stock/preorder when off: price stays', () => {
    expect(price(card(product(OUT)).container)).toHaveTextContent('£29.00');
    cleanup();
    expect(price(card(product(), { showOutOfStockPrice: false }).container)).toHaveTextContent('£29.00');
    cleanup();
    expect(price(card(product({ inStock: false, isPreorder: true }), { showOutOfStockPrice: false }).container)).toHaveTextContent('£29.00');
  });
});

describe('showCategoryEmoji', () => {
  const CATS: Category[] = [
    { id: 1, name: 'Pantry', slug: 'pantry', parentId: null, sortOrder: 0, emoji: '🥜' },
    { id: 2, name: 'Drinks', slug: 'drinks', parentId: null, sortOrder: 1, emoji: null },
  ];
  function Shell() { return <Outlet context={{ search: '', setSearch: () => {} }} />; }

  function list(options: Record<string, boolean>) {
    state.catalog = { categories: CATS, products: [product({ id: 1 }), product({ id: 2, categoryId: 2, categoryName: 'Drinks', sku: 'NB-2' })] };
    settings();
    return render(
      <MantineProvider env="test">
        <TemplateProvider resolved={resolveTheme({ ...THEME, options }, lookupManifest)} fallback={null} load={() => Promise.resolve(MODULE)} peek={() => MODULE}>
          <MemoryRouter initialEntries={['/']}>
            <Routes><Route element={<Shell />}><Route path="/" element={<ProductList />} /></Route></Routes>
          </MemoryRouter>
        </TemplateProvider>
      </MantineProvider>,
    );
  }

  it('list heads draw the emoji and reserve a glyph column by default', () => {
    const { container } = list({});
    expect(container.textContent).toContain('🥜');
    expect(container.querySelectorAll('[class*="groupName"] [class*="glyph"]')).toHaveLength(2);
  });

  it('false: no emoji and no glyph column in the list heads or the category nav', () => {
    const { container } = list({ showCategoryEmoji: false });
    expect(container.textContent).not.toContain('🥜');
    expect(container.querySelectorAll('[class*="glyph"]')).toHaveLength(0);
  });

  function nav(options: Record<string, boolean>) {
    settings();
    const tree = buildCategoryTree(CATS, new Map([[1, 1], [2, 1]]));
    return wrap(<CategoryNav tree={tree} total={2} activeId={null} />, options);
  }

  it('category nav: emoji in chips and tree by default', () => {
    const { container } = nav({});
    expect(container.textContent).toContain('🥜');
    expect(container.querySelectorAll('[class*="glyph"]').length).toBeGreaterThan(0);
  });

  it('category nav, false: no emoji in chips, no glyph column in the tree', () => {
    const { container } = nav({ showCategoryEmoji: false });
    expect(container.textContent).not.toContain('🥜');
    expect(container.querySelectorAll('[class*="glyph"]')).toHaveLength(0);
  });
});
