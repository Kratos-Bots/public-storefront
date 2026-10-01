import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import type { ReactNode } from 'react';
import type { Catalog } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import { catalogOf, SETTINGS, baseProduct } from './helpers/product-fixtures.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));
const answer = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: () => {} });
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => answer(state.catalog),
  useProduct: (id: number | null) => answer(id == null ? undefined : state.catalog?.products.find((p) => p.id === id)),
}));
// The chrome-less frame, reduced to what it must see from the exact preview (spec §6.2).
vi.mock('@/layouts/Chromeless.tsx', async () => {
  const { usePageSetContext } = await import('@/builder/page-set-context.ts');
  const { useCardDesign } = await import('@/builder/card-design.tsx');
  return {
    Chromeless: () => {
      const ctx = usePageSetContext();
      return <i data-mark="chromeless" data-layout={ctx?.layout ?? 'none'} data-tile={useCardDesign('tile') ? 'yes' : 'no'} />;
    },
  };
});

import { FIXTURE_PRODUCT } from '@/builder/editor/fixtures.ts';
import { pickPreviewProduct } from '@/builder/editor/preview-product.ts';
import { FixtureRoutes, fixtureLocation } from '@/builder/editor/fixture-routes.tsx';
import { createFixtureInterceptor } from '@/builder/editor/fixture-api.ts';
import { SheetStage } from '@/builder/editor/SheetStage.tsx';
import { addBlockHint, PreviewProductPicker } from '@/builder/editor/EditorHeader.tsx';
import { ExactRuntime, routeKeyFor } from '@/builder/editor/ExactPreview.tsx';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { ROOT_ZONE } from '@/builder/editor/config.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import type { PuckDoc } from '@/builder/types.ts';
import sheetClasses from '@/features/catalog/ProductDetailSheet.module.css';

const MENU = { ...SETTINGS, features: { ...SETTINGS.features, layout: 'menu' } } as StorefrontSettings;
const PLAIN = baseProduct({ id: 11, sku: 'NB-A', displayName: 'Northbound Tin A', imageProductId: null, categoryName: 'Pantry > Oats' });
const PHOTO = baseProduct({ id: 12, sku: 'NB-B', displayName: 'Northbound Tin B', imageProductId: 12 });

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MantineProvider env="test">
        <MemoryRouter>{children}</MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  state.settings = MENU;
  state.catalog = catalogOf(PLAIN, PHOTO);
  useEditorStore.setState({ status: 'ready', layout: 'menu', readOnly: false, docs: {}, docKey: 'product', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, previewProductId: null });
});
afterEach(cleanup);

describe('pickPreviewProduct', () => {
  it('chosen, else first with a photo, else first, else the sample', () => {
    expect(pickPreviewProduct([], null)).toBe(FIXTURE_PRODUCT);
    expect(pickPreviewProduct([PLAIN, PHOTO], null)).toBe(PHOTO);
    expect(pickPreviewProduct([PLAIN, PHOTO], PLAIN.id)).toBe(PLAIN);
    expect(pickPreviewProduct([PLAIN, PHOTO], 999)).toBe(PHOTO);
    expect(pickPreviewProduct([PLAIN], null)).toBe(PLAIN);
  });

  it('the sample is invented Northbound data with no photo', () => {
    expect(FIXTURE_PRODUCT).toMatchObject({ id: 900201, displayName: 'Northbound Trail Oats 1kg', sku: 'NB-TO-01', price: 12, imageProductId: null, categoryId: null });
    expect(FIXTURE_PRODUCT.pricingTiers).toHaveLength(1);
    expect(FIXTURE_PRODUCT.description).toBeTruthy();
    expect(FIXTURE_PRODUCT.provenance).toBeTruthy();
  });
});

describe('fixtureLocation', () => {
  it('the storefront product is a page route; the menu / web-app product is the sheet doc with ?p=', () => {
    expect(fixtureLocation('product', 7, 'storefront')).toEqual({ pattern: 'p/:id', path: 'p/7' });
    expect(fixtureLocation('product', 7, 'menu')).toEqual({ pattern: 'doc/:docKey', path: 'doc/product', params: { p: '7' } });
    expect(fixtureLocation('product', 7, 'webapp')).toEqual({ pattern: 'doc/:docKey', path: 'doc/product', params: { p: '7' } });
    expect(fixtureLocation('card:tile', 7, 'menu').path).toBe('doc/card-tile');
    expect(fixtureLocation('card:row', 7, 'storefront').path).toBe('doc/card-row');
  });
});

describe('FixtureRoutes', () => {
  it('opens the sheet doc with ?p=<preview id>, follows Preview with, and drops ?p= on leaving', async () => {
    const router = createMemoryRouter(
      [{ path: '/__builder/*', element: <FixtureRoutes><p>canvas</p></FixtureRoutes> }],
      { initialEntries: ['/__builder?sf-builder=1'] },
    );
    render(<RouterProvider router={router} />);
    await screen.findByText('canvas');
    expect(router.state.location.pathname).toBe('/__builder/doc/product');
    expect(router.state.location.search).toBe(`?sf-builder=1&p=${PHOTO.id}`);
    await act(async () => useEditorStore.getState().setPreviewProduct(PLAIN.id));
    expect(router.state.location.search).toBe(`?sf-builder=1&p=${PLAIN.id}`);
    await act(async () => useEditorStore.setState({ docKey: 'cart' }));
    expect(router.state.location.pathname).toBe('/__builder/doc/cart');
    expect(router.state.location.search).toBe('?sf-builder=1');
    // The storefront product is a page: the id rides in the path.
    await act(async () => useEditorStore.setState({ docKey: 'product', layout: 'storefront' }));
    expect(router.state.location.pathname).toBe(`/__builder/p/${PLAIN.id}`);
    expect(router.state.location.search).toBe('?sf-builder=1');
  });
});

describe('fixture interceptor', () => {
  it('answers the sample product without touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const path of [`catalog/products/${FIXTURE_PRODUCT.id}`, `storefront/catalog/products/${FIXTURE_PRODUCT.id}`]) {
      const request = new Request(`http://localhost:3000/api/${path}`);
      const result = await createFixtureInterceptor(() => DEFAULT_PREVIEW_AS, vi.fn())(request);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(200);
      expect(((await (result as Response).json()) as { data: unknown }).data).toEqual(FIXTURE_PRODUCT);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('SheetStage', () => {
  it('draws the doc in a sheet column between inert copies of its header and footer', () => {
    const doc = defaultDoc('product', 'menu')!;
    const { container } = render(wrap(<SheetStage><RenderDoc doc={doc} docKey="product" layout="menu" /></SheetStage>));
    const stage = container.querySelector<HTMLElement>('[data-sf-builder-sheet]')!;
    expect(stage).not.toBeNull();
    const chrome = stage.querySelectorAll<HTMLElement>('[inert]');
    expect(chrome).toHaveLength(2);
    const [head, foot] = [chrome[0]!, chrome[1]!];
    expect(head.getAttribute('aria-hidden')).toBe('true');
    expect(head.querySelector(`.${sheetClasses.eyebrow}`)).not.toBeNull();
    expect(head.querySelector(`.${sheetClasses.close}`)).not.toBeNull();
    // The preview product (first with a photo) fills the body through the sheet surface.
    const body = stage.querySelector<HTMLElement>(`.${sheetClasses.body}`)!;
    expect(body.querySelector('[data-sf-part="sheet-title"]')).toHaveTextContent('Northbound Tin B');
    // The add button lives in the pinned footer, never in the document.
    expect(body.querySelector('[data-sf-part="button"]')).toBeNull();
    expect(foot.querySelector('[data-sf-part="button"]')).not.toBeNull();
    expect(body.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('follows Preview with, and names the category in the eyebrow', () => {
    useEditorStore.setState({ previewProductId: PLAIN.id });
    const { container } = render(wrap(<SheetStage><RenderDoc doc={defaultDoc('product', 'menu')!} docKey="product" layout="menu" /></SheetStage>));
    expect(container.querySelector('[data-sf-part="sheet-title"]')).toHaveTextContent('Northbound Tin A');
    expect(container.querySelector(`.${sheetClasses.eyebrow}`)).toHaveTextContent('Pantry / Oats');
  });
});

describe('PreviewProductPicker', () => {
  it('lists the catalogue and sets the preview product', () => {
    render(wrap(<PreviewProductPicker />));
    const select = screen.getByRole('combobox', { name: 'Preview with' });
    expect(select).toHaveValue(String(PHOTO.id));
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(['Northbound Tin A', 'Northbound Tin B']);
    fireEvent.change(select, { target: { value: String(PLAIN.id) } });
    expect(useEditorStore.getState().previewProductId).toBe(PLAIN.id);
  });

  it('offers the sample when the catalogue is empty', () => {
    state.catalog = catalogOf();
    render(wrap(<PreviewProductPicker />));
    const select = screen.getByRole('combobox', { name: 'Preview with' });
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(['Northbound Trail Oats 1kg (sample)']);
  });

  it('shows on card docs, not on the catalogue', () => {
    useEditorStore.setState({ docKey: 'card:tile' });
    const { unmount } = render(wrap(<PreviewProductPicker />));
    expect(screen.getByRole('combobox', { name: 'Preview with' })).toBeInTheDocument();
    unmount();
    useEditorStore.setState({ docKey: 'catalog' });
    render(wrap(<PreviewProductPicker />));
    expect(screen.queryByRole('combobox', { name: 'Preview with' })).toBeNull();
  });
});

describe('exact preview of the sheet', () => {
  it('previews the menu / web-app product through the catalogue (which opens ?p=)', () => {
    expect(routeKeyFor('product', 'menu')).toBe('catalog');
    expect(routeKeyFor('product', 'webapp')).toBe('catalog');
    expect(routeKeyFor('product', 'storefront')).toBe('product');
    expect(routeKeyFor('shell', 'storefront')).toBe('catalog');
    expect(routeKeyFor('card:row', 'menu')).toBe('catalog');
    expect(routeKeyFor('cart', 'menu')).toBe('cart');
  });

  it('a chrome-less page still sees the page set and its card designs', async () => {
    state.settings = SETTINGS;
    const tile = defaultDoc('card:tile', 'storefront');
    const page: PuckDoc = { root: { props: { title: '', description: '', chrome: 'none' } }, content: [] };
    expect(tile).not.toBeNull();
    // Stored straight into the draft: a load keeps the set sparse and drops a card equal to its default.
    useEditorStore.setState({ layout: 'storefront', docs: { 'page:about': page, 'card:tile': tile! }, docKey: 'page:about' });
    const router = createMemoryRouter(
      [{ path: '/__builder/doc/:docKey/*', element: <ExactRuntime failTitle="x" failBody="y" /> }],
      { initialEntries: ['/__builder/doc/page-about'] },
    );
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>
      </QueryClientProvider>,
    );
    await act(async () => {});
    const mark = container.querySelector('[data-mark="chromeless"]')!;
    expect(mark).not.toBeNull();
    expect(mark.getAttribute('data-layout')).toBe('storefront');
    expect(mark.getAttribute('data-tile')).toBe('yes');
  });
});

describe('Add block hint', () => {
  it('blocks go after the selection or at the end of the page', () => {
    expect(addBlockHint({ zone: ROOT_ZONE, index: 3, nested: false }, null)).toBe('Adds at the end of the page.');
    expect(addBlockHint({ zone: ROOT_ZONE, index: 1, nested: false }, { index: 0, zone: ROOT_ZONE })).toBe('Adds after the selected block.');
  });

  it('parts name the container they land in', () => {
    const sel = { index: 0, zone: 'pd:main' };
    expect(addBlockHint({ zone: 'pd:main', index: 1, nested: true }, sel, { container: 'Product detail' })).toBe('Parts go after the selected block.');
    expect(addBlockHint({ zone: 'pd:main', index: 4, nested: true }, null, { container: 'Product detail' })).toBe('Parts go at the end of the Product detail block.');
    expect(addBlockHint({ zone: ROOT_ZONE, index: 2, nested: false }, null, { container: null })).toBe('Parts belong inside their container. Add one first, or move the part into it.');
  });
});
