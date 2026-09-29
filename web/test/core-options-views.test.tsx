import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import type { ComponentType } from 'react';
import type { StorefrontSettings, Theme } from '@/types/settings.ts';
import type { Catalog, Product } from '@/types/catalog.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));

vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: () => ({ data: undefined, isPending: false, isError: false, refetch: () => {} }),
}));

import { ProductGrid } from '@/features/catalog/ProductGrid.tsx';
import { ProductList } from '@/features/catalog/ProductList.tsx';
import { WholesaleCatalogPage } from '@/features/wholesale/WholesaleCatalogPage.tsx';
import { TemplateProvider } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { TemplateModule } from '@/templates/slots.ts';

function product(id: number, name: string): Product {
  return {
    id, sku: `SKU-${id}`, name, displayName: name, shortDisplayName: null, description: null,
    categoryId: 1, categoryName: 'Peptides', sortOrder: id, price: 20, inStock: true, lowStockAlert: false,
    isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [], upsellProductIds: [],
    excludedFromFreeShipping: false, imageProductId: null, provenance: null, minOrderQuantity: null, maxOrderQuantity: null,
  };
}
const CATALOG: Catalog = {
  categories: [{ id: 1, name: 'Peptides', slug: 'peptides', parentId: null, sortOrder: 0, emoji: null }],
  products: [product(1, 'BPC-157 5mg'), product(2, 'TB-500 5mg')],
};

const THEME: Theme = {
  scheme: 'dark',
  colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '',
};

/** Modern's default slots plus a visible section label, so the label gate is observable. */
const MODULE: TemplateModule = { slots: { SectionLabel: ({ title, level }) => <p>label {level} {title}</p> } };

function Shell() {
  return <Outlet context={{ search: '', setSearch: () => {} }} />;
}

function mount(View: ComponentType, options: Record<string, boolean>, layout: 'storefront' | 'menu' = 'storefront') {
  state.catalog = CATALOG;
  state.settings = {
    currency: 'GBP', welcomeMessage: 'Welcome in',
    brand: { name: 'Shop', title: 'Shop', tagline: 'Tag line', links: { whatsapp: null, telegram: null } },
    features: { layout, ordering: false, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  } as StorefrontSettings;
  const resolved = resolveTheme({ ...THEME, options }, lookupManifest);
  return render(
    <MantineProvider env="test">
      <TemplateProvider resolved={resolved} fallback={null} load={() => Promise.resolve(MODULE)} peek={() => MODULE}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/" element={<View />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TemplateProvider>
    </MantineProvider>,
  );
}

afterEach(() => cleanup());

describe.each<[string, ComponentType, 'storefront' | 'menu', string, string]>([
  ['ProductGrid', ProductGrid, 'storefront', 'All products', '2 products'],
  ['ProductList', ProductList, 'menu', 'All products', 'products'],
  ['WholesaleCatalogPage', WholesaleCatalogPage, 'storefront', 'Trade list', 'lines'],
])('%s core options', (_name, View, layout, title, tally) => {
  it('shows the title block, the intro and the section label by default', () => {
    mount(View, {}, layout);
    const h1 = screen.getByRole('heading', { level: 1, name: title });
    expect(h1).toHaveAttribute('data-sf-part', 'page-title');
    expect(h1).not.toHaveClass('sf-visually-hidden');
    expect(screen.getByText(tally)).toBeInTheDocument();
    expect(screen.getByText('Welcome in')).toBeInTheDocument();
    expect(screen.getByText(`label page ${title}`)).toBeInTheDocument();
  });

  it('showPageTitle false: the h1 stays findable by role but is visually hidden; tally and page label go', () => {
    mount(View, { showPageTitle: false }, layout);
    const h1 = screen.getByRole('heading', { level: 1, name: title });
    expect(h1).toHaveClass('sf-visually-hidden');
    expect(screen.queryByText(tally)).toBeNull();
    expect(screen.queryByText(`label page ${title}`)).toBeNull();
    expect(screen.getByText('Welcome in')).toBeInTheDocument(); // the intro is its own option
  });

  it('showCatalogIntro false: the intro is gone, the title stays', () => {
    mount(View, { showCatalogIntro: false }, layout);
    expect(screen.queryByText('Welcome in')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: title })).not.toHaveClass('sf-visually-hidden');
  });

  it('showSectionLabels false: no section labels at any level', () => {
    mount(View, { showSectionLabels: false }, layout);
    expect(screen.queryByText(/^label /)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });
});

describe('ProductList group labels', () => {
  it('are gated by showSectionLabels too', () => {
    mount(ProductList, {}, 'menu');
    expect(screen.getByText('label group Peptides')).toBeInTheDocument();
    cleanup();
    mount(ProductList, { showSectionLabels: false }, 'menu');
    expect(screen.queryByText('label group Peptides')).toBeNull();
  });
});
