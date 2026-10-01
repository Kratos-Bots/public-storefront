import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import type { Catalog } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import { CATEGORIES, catalogOf, MATE, SETTINGS, baseProduct } from './helpers/product-fixtures.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => ({ data: state.catalog, isPending: false, isError: false, refetch: () => {} }),
  useProduct: (id: number | null) => ({ data: state.catalog?.products.find((p) => p.id === id), isPending: false, isError: false, refetch: () => {} }),
}));

import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { ProductImage } from '@/features/catalog/ProductImage.tsx';
import { Upsells } from '@/features/catalog/Upsells.tsx';
import { CategoryNav } from '@/features/catalog/CategoryNav.tsx';
import { buildCategoryTree } from '@/features/catalog/category-tree.ts';
import { SearchField } from '@/layouts/SearchField.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';

const ATTRS = { 'data-sf-style': 'X', 'data-sfs-bg': 'surface' } as const;
const STRIP = ' data-sf-style="X" data-sfs-bg="surface"';
/** Mantine mints a fresh random id per mount; it is not part of the markup under comparison. */
const norm = (html: string) => html.replace(/mantine-[a-z0-9]{9}/g, 'mantine-ID');
function wrap(node: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test"><MemoryRouter>{node}</MemoryRouter></MantineProvider>
    </QueryClientProvider>,
  );
}
/** Same markup with and without the attributes (once stripped), and the attributes on `selector`. */
function check(make: (attrs?: typeof ATTRS) => ReactNode, selector: string, count = 1) {
  const plain = norm(wrap(make()).container.innerHTML);
  cleanup();
  const { container } = wrap(make(ATTRS));
  const hits = container.querySelectorAll(`${selector}[data-sf-style="X"][data-sfs-bg="surface"]`);
  expect(hits).toHaveLength(count);
  expect(norm(container.innerHTML.replaceAll(STRIP, ''))).toBe(plain);
}

afterEach(cleanup);

describe('rootAttrs (spec §9)', () => {
  const product = baseProduct({ imageProductId: 1, upsellProductIds: [2] });
  beforeEach(() => { state.settings = SETTINGS; state.catalog = catalogOf(product, MATE); });
  it('AddToCart → the button', () => check((a) => <AddToCart product={product} rootAttrs={a} />, 'button'));
  it('ProductImage → the well span', () => check((a) => <ProductImage productId={1} alt="x" rootAttrs={a} />, 'span'));
  it('Upsells → the section', () => check((a) => <Upsells product={product} rootAttrs={a} />, 'section[aria-labelledby="upsells-heading"]'));
  it('CategoryNav → both navs', () => check((a) => <CategoryNav tree={buildCategoryTree(CATEGORIES, new Map([[2, 1]]))} total={1} activeId={null} navAttrs={a} />, 'nav', 2));
  it('SearchField → the root wrapper, never the input', () => {
    check((a) => <SearchField value="" onChange={() => {}} rootAttrs={a} />, 'div');
    expect(document.querySelector('input[data-sf-style]')).toBeNull();
  });
  it('EmptyState → its root', () => check((a) => <EmptyState title="Nothing" rootAttrs={a} />, 'div'));
});
