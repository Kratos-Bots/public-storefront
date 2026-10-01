import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { useState, type ComponentType } from 'react';
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
import { useCartStore } from '@/stores/cart.ts';
import { useUiStore } from '@/stores/ui.ts';
import { TemplateProvider } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { TemplateModule } from '@/templates/slots.ts';

function product(id: number, name: string): Product {
  return {
    id, sku: `SKU-${id}`, name, displayName: name, shortDisplayName: null, shortDescription: null, description: null,
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

/** Holds the search the way the real shells do, so a sheet's own search field can filter. */
function Shell() {
  const [search, setSearch] = useState('');
  return <Outlet context={{ search, setSearch }} />;
}

function mount(
  View: ComponentType,
  options: Record<string, boolean>,
  layout: 'storefront' | 'menu' | 'webapp' = 'storefront',
  features: Partial<StorefrontSettings['features']> = {},
  catalog: Catalog = CATALOG,
) {
  state.catalog = catalog;
  state.settings = {
    currency: 'GBP', welcomeMessage: 'Welcome in',
    brand: { name: 'Shop', title: 'Shop', tagline: 'Tag line', links: { whatsapp: null, telegram: null } },
    features: { layout, ordering: false, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false, ...features },
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

describe('WholesaleCatalogPage basket bar', () => {
  function withLine() {
    useCartStore.setState({
      mode: 'local',
      lines: [{
        productId: 1, displayName: 'BPC-157 5mg', sku: 'SKU-1', unitPrice: 20, basePrice: 20, pricingTiers: [],
        quantity: 2, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
      }],
    });
  }
  afterEach(() => useCartStore.setState({ lines: [], mode: 'local' }));

  it('rides the foot of the sheet in the list layouts', () => {
    withLine();
    mount(WholesaleCatalogPage, {}, 'menu', { ordering: true, wholesale: true });
    expect(screen.getByRole('link', { name: /^View basket/ })).toBeInTheDocument();
  });

  it("stands down in the web app, whose primary action is the cart button there too", () => {
    withLine();
    mount(WholesaleCatalogPage, {}, 'webapp', { ordering: true, wholesale: true });
    expect(screen.queryByRole('link', { name: /^View basket/ })).toBeNull();
  });
});

describe('showSku: the trade list', () => {
  const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent);

  it('by default carries the Code column, each code, and a search that names codes', () => {
    mount(WholesaleCatalogPage, {}, 'storefront');
    expect(headers()).toEqual(['Code', 'Product', 'Unit', 'Bulk']);
    expect(screen.getByText('SKU-1')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search name or code')).toBeInTheDocument();
    expect(document.querySelector('[class*="noCode"]')).toBeNull();
  });

  it('hidden: one fewer column, no code cells, a plain "Search", and rows marked noCode', () => {
    mount(WholesaleCatalogPage, { showSku: false }, 'storefront');
    expect(headers()).toEqual(['Product', 'Unit', 'Bulk']);
    expect(screen.queryByText('SKU-1')).toBeNull();
    expect(screen.queryByText('SKU-2')).toBeNull();
    expect(screen.queryByPlaceholderText('Search name or code')).toBeNull();
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1); // past the head row
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.className).toMatch(/noCode/);
  });

  it('hidden, with ordering on: the Line and Qty columns stay, Code alone goes', () => {
    mount(WholesaleCatalogPage, { showSku: false }, 'storefront', { ordering: true, wholesale: true });
    expect(headers()).toEqual(['Product', 'Unit', 'Bulk', 'Line', 'Qty']);
  });

  it.each([
    ['shown', {}],
    ['hidden', { showSku: false }],
  ])('every row has as many cells as there are column headers (%s)', (_label, options) => {
    mount(WholesaleCatalogPage, options, 'storefront');
    const count = screen.getAllByRole('columnheader').length;
    for (const row of screen.getAllByRole('row').slice(1)) {
      expect(within(row).getAllByRole('cell')).toHaveLength(count);
    }
  });

  it.each([
    ['shown', {}, 4],
    ['hidden', { showSku: false }, 3],
  ])('the unrolled tier ladder lines up with the columns (%s)', (_label, options, count) => {
    const tiered = { ...product(1, 'BPC-157 5mg'), pricingTiers: [{ id: 1, minQuantity: 10, price: 15 }] };
    mount(WholesaleCatalogPage, options, 'storefront', {}, { ...CATALOG, products: [tiered, product(2, 'TB-500 5mg')] });
    fireEvent.click(screen.getByRole('button', { name: 'Show the price breaks for BPC-157 5mg' }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(count);
    const rungs = screen.getAllByText(/\+ units$/).map((cell) => cell.closest('tr')!);
    expect(rungs.length).toBeGreaterThan(0);
    for (const rung of rungs) expect(within(rung).getAllByRole('cell')).toHaveLength(count);
  });

  it('hidden codes are still searchable', () => {
    mount(WholesaleCatalogPage, { showSku: false }, 'storefront');
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'sku-2' } });
    expect(screen.queryByText('BPC-157 5mg')).toBeNull();
    expect(screen.getByText('TB-500 5mg')).toBeInTheDocument();
    expect(screen.queryByText('SKU-2')).toBeNull(); // matched, still not shown
  });
});

describe('showSku: the menu list rows', () => {
  it('show each code by default and none when hidden', () => {
    mount(ProductList, {}, 'menu');
    expect(screen.getByText('SKU-1')).toBeInTheDocument();
    cleanup();
    mount(ProductList, { showSku: false }, 'menu');
    expect(screen.queryByText('SKU-1')).toBeNull();
    expect(screen.getByText('BPC-157 5mg')).toBeInTheDocument();
  });
});

describe('showCategoryPicker', () => {
  const navs = () => screen.queryAllByRole('navigation', { name: 'Categories' });
  afterEach(() => useUiStore.setState({ filterOpen: false }));

  it('ProductGrid: chips and rail by default, on the split layout', () => {
    const { container } = mount(ProductGrid, {}, 'storefront');
    expect(navs()).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 2, name: 'Categories' })).toBeInTheDocument();
    expect(container.querySelector('[class*="noNav"]')).toBeNull();
  });

  it('ProductGrid hidden: no chips, no rail, and the layout goes full width', () => {
    const { container } = mount(ProductGrid, { showCategoryPicker: false }, 'storefront');
    expect(navs()).toHaveLength(0);
    expect(screen.queryByRole('heading', { level: 2, name: 'Categories' })).toBeNull();
    expect(container.querySelector('[class*="layout"]')!.className).toMatch(/noNav/);
    expect(screen.getByText('BPC-157 5mg')).toBeInTheDocument();
  });

  it('ProductGrid: the filter drawer opens by default and is not there at all when hidden', () => {
    useUiStore.setState({ filterOpen: true });
    mount(ProductGrid, {}, 'storefront');
    expect(navs()).toHaveLength(3); // chips, rail, drawer
    cleanup();
    mount(ProductGrid, { showCategoryPicker: false }, 'storefront');
    expect(navs()).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ProductList: the filter sheet opens by default and is not there at all when hidden', () => {
    useUiStore.setState({ filterOpen: true });
    mount(ProductList, {}, 'menu');
    expect(navs()).toHaveLength(1);
    cleanup();
    mount(ProductList, { showCategoryPicker: false }, 'menu');
    expect(navs()).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('BPC-157 5mg')).toBeInTheDocument();
  });
});
