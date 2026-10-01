import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import type { Catalog, Product } from '@/types/catalog.ts';
import type { StorefrontSettings, Theme } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () =>
    ({
      currency: 'GBP',
      brand: { name: 'Shop', title: 'Shop', tagline: '', links: { whatsapp: null, telegram: null } },
      features: { layout: 'menu', ordering: true, upsell: false },
    }) as unknown as StorefrontSettings,
}));

const state = vi.hoisted(() => ({ catalog: undefined as Catalog | undefined }));

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

import { ProductDetailPage } from '@/features/catalog/ProductDetailPage.tsx';
import { ProductDetailSheet } from '@/features/catalog/ProductDetailSheet.tsx';
import { TemplateProvider } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { TemplateModule } from '@/templates/slots.ts';

const PRODUCT: Product = {
  id: 1, sku: 'BPC-157-5MG', name: 'BPC-157 5mg', displayName: 'BPC-157 5mg', shortDisplayName: null, shortDescription: null, description: null,
  categoryId: null, categoryName: null, sortOrder: 0, price: 29, inStock: true, lowStockAlert: false,
  isActive: true, isPreorder: false, preorderEta: null, pricingTiers: [], upsellProductIds: [],
  excludedFromFreeShipping: false, imageProductId: null, provenance: null,
  minOrderQuantity: null, maxOrderQuantity: null,
};

const THEME: Theme = {
  scheme: 'dark',
  colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '',
};
const MODULE: TemplateModule = { slots: {} };

function wrap(children: ReactNode, options: Record<string, boolean>) {
  state.catalog = { products: [PRODUCT], categories: [] };
  return render(
    <MantineProvider env="test">
      <TemplateProvider
        resolved={resolveTheme({ ...THEME, options }, lookupManifest)}
        fallback={null}
        load={() => Promise.resolve(MODULE)}
        peek={() => MODULE}
      >
        <MemoryRouter initialEntries={['/p/1']}>
          <Routes>
            <Route path="/p/:id" element={children} />
          </Routes>
        </MemoryRouter>
      </TemplateProvider>
    </MantineProvider>,
  );
}

const mountPage = (options: Record<string, boolean>) => wrap(<ProductDetailPage />, options);
const mountSheet = (options: Record<string, boolean>) =>
  wrap(<ProductDetailSheet productId={1} onClose={() => {}} onSelect={() => {}} />, options);

afterEach(() => cleanup());

describe.each([
  ['ProductDetailPage', mountPage, 1],
  ['ProductDetailSheet', mountSheet, 2],
] as const)('%s showSku', (_name, mount, level) => {
  it('shows the code by default', () => {
    mount({});
    expect(screen.getByRole('heading', { level, name: 'BPC-157 5mg' })).toBeInTheDocument();
    expect(screen.getByText('BPC-157-5MG')).toBeInTheDocument();
  });

  it('hidden: no code, the product is otherwise all there', () => {
    mount({ showSku: false });
    expect(screen.getByRole('heading', { level, name: 'BPC-157 5mg' })).toBeInTheDocument();
    expect(screen.queryByText('BPC-157-5MG')).toBeNull();
    expect(screen.getAllByText('£29.00').length).toBeGreaterThan(0);
  });
});
