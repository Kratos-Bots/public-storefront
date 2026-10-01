import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { useMemo, type ComponentType, type ReactNode } from 'react';
import type { Catalog } from '@/types/catalog.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';
import { catalogOf, SETTINGS, baseProduct } from './helpers/product-fixtures.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings, catalog: undefined as Catalog | undefined }));
const answer = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: () => {} });
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/features/catalog/use-catalog.ts', () => ({
  CATALOG_KEY: ['catalog'],
  useCatalog: () => answer(state.catalog),
  useProduct: (id: number | null) => answer(id == null ? undefined : state.catalog?.products.find((p) => p.id === id)),
}));

import { cardStates } from '@/builder/editor/card-states.ts';
import { CardStage } from '@/builder/editor/CardStage.tsx';
import { draftCards } from '@/builder/editor/EditorCanvas.tsx';
import { CardDesignProvider, resetCardDesignLog } from '@/builder/card-design.tsx';
import { CardRowFamily, CardTileFamily } from '@/builder/families.ts';
import { TILE_VIEWS } from '@/features/catalog/ProductCard.tsx';
import type { PartViewProps } from '@/builder/parts.ts';
import { prepareDoc } from '@/builder/editor/prepare.ts';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { defaultDoc } from '@/builder/defaults/index.ts';
import stageStyles from '@/builder/editor/CardStage.module.css';
import listClasses from '@/features/catalog/ProductList.module.css';
import stockClasses from '@/features/catalog/StockChip.module.css';
import imageClasses from '@/features/catalog/ProductImage.module.css';

const PHOTO = baseProduct({ id: 12, sku: 'NB-B', displayName: 'Northbound Tin B', imageProductId: 12, preorderEta: null });
const ROOT = { props: { title: '', description: '', chrome: 'shell' as const } };
const c = (type: string, props: Record<string, unknown> = {}, id = type): ComponentData => ({ type, props: { id, ...props } });
const tileDoc = (body: ComponentData[]): PuckDoc => ({ root: ROOT, content: [c('CardTile', { content: [
  c('CardTileImage'), c('CardTileGroup', { kind: 'body', items: body }, 'body'),
] }, 'frame')] });
/** Price above name: a valid draft that differs visibly from the built-in tile. */
const priceFirst = () => tileDoc([c('CardTilePrice'), c('CardTileName'), c('CardTileGroup', { kind: 'foot', items: [c('CardTileAdd')] }, 'foot')]);
/** Add without price: breaks part-requires, so the guard rejects the draft. */
const addWithoutPrice = () => tileDoc([c('CardTileName'), c('CardTileGroup', { kind: 'foot', items: [c('CardTileAdd')] }, 'foot')]);

/** What the editor canvas wraps the Puck host in: the store's drafts through draftCards. */
function Canvas({ children }: { children: ReactNode }) {
  const docs = useEditorStore((s) => s.docs);
  const layout = useEditorStore((s) => s.layout);
  const cards = useMemo(() => draftCards(docs), [docs]);
  return <CardDesignProvider cards={cards} layout={layout}>{children}</CardDesignProvider>;
}

function Probe({ kind }: { kind: 'tile' | 'row' }) {
  const Family = kind === 'tile' ? CardTileFamily : CardRowFamily;
  const { product, index, eager, hasSiblingImages } = Family.useData();
  return <p data-probe="" data-id={product.id} data-index={index} data-eager={String(eager)} data-siblings={String(hasSiblingImages)} />;
}

function mount(kind: 'tile' | 'row') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MantineProvider env="test">
        <MemoryRouter>
          <Canvas>
            <CardStage kind={kind}><Probe kind={kind} /></CardStage>
          </Canvas>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

/** Part order inside a copy, by the data-sf-part / class markers the tile draws. */
function order(el: Element): Array<'name' | 'price'> {
  return [...el.querySelectorAll('h3, [data-sf-part="price"]')].map((n) => (n.tagName === 'H3' ? 'name' : 'price'));
}

beforeEach(() => {
  state.settings = SETTINGS;
  state.catalog = catalogOf(baseProduct({ id: 11, imageProductId: null }), PHOTO);
  useEditorStore.setState({ status: 'ready', layout: 'storefront', readOnly: false, docs: {}, docKey: 'card:tile', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, previewProductId: null });
});
afterEach(() => { cleanup(); resetCardDesignLog(); vi.restoreAllMocks(); });

describe('cardStates (spec §11)', () => {
  it('three clones with exactly those fields flipped; the product is untouched', () => {
    const p = baseProduct({ id: 5, isPreorder: false, inStock: true, imageProductId: 7, minOrderQuantity: null });
    const before = structuredClone(p);
    const states = cardStates(p);
    expect(states.map((s) => s.label)).toEqual(['Out of stock', 'Pre-order, minimum 3', 'No photo']);
    expect(states[0]!.product).toEqual({ ...p, inStock: false, isPreorder: false });
    expect(states[1]!.product).toEqual({ ...p, isPreorder: true, preorderEta: states[1]!.product.preorderEta, minOrderQuantity: 3 });
    expect(typeof states[1]!.product.preorderEta).toBe('number');
    expect(states[2]!.product).toEqual({ ...p, imageProductId: null });
    for (const s of states) expect(s.product).not.toBe(p);
    expect(p).toEqual(before);
  });
  it('keeps the product’s own pre-order date when it has one', () => {
    const eta = Date.UTC(2026, 11, 1, 12);
    expect(cardStates(baseProduct({ preorderEta: eta }))[1]!.product.preorderEta).toBe(eta);
  });
});

describe('CardStage kind="tile"', () => {
  it('the editable card, then three inert state copies, in the real grid', () => {
    const { container } = mount('tile');
    const grid = container.querySelector('[data-sf-part="product-grid"]')!;
    expect(grid).not.toBeNull();
    const kids = [...grid.children];
    expect(kids).toHaveLength(4);
    const probe = kids[0]!;
    expect(probe.matches('[data-probe]')).toBe(true);
    expect(probe.getAttribute('data-id')).toBe(String(PHOTO.id));
    expect(probe.getAttribute('data-index')).toBe('0');
    expect(probe.getAttribute('data-eager')).toBe('true');
    expect(probe.getAttribute('data-siblings')).toBe('true');
    const copies = kids.slice(1);
    expect(copies.map((k) => k.getAttribute('aria-label'))).toEqual(['Out of stock', 'Pre-order, minimum 3', 'No photo']);
    for (const k of copies) {
      expect(k.hasAttribute('inert')).toBe(true);
      expect(k.className).toContain(stageStyles.copy);
      expect(k.querySelector('[data-sf-part="product-card"]')).not.toBeNull();
    }
    expect(copies[0]!.querySelector(`.${stockClasses.out}`)).not.toBeNull();
    expect(copies[2]!.querySelector(`.${imageClasses.well}`)).not.toBeNull();
    // The built-in tile: name before price.
    expect(order(copies[0]!)).toEqual(['name', 'price']);
  });

  it('copies render the draft design; an invalid draft falls back to the built-in card', async () => {
    useEditorStore.setState({ docs: { 'card:tile': priceFirst() } });
    const { container } = mount('tile');
    const copies = () => [...container.querySelectorAll('[data-sf-part="product-grid"] > [aria-label]')];
    for (const k of copies()) expect(order(k)).toEqual(['price', 'name']);
    await act(async () => useEditorStore.setState({ docs: { 'card:tile': addWithoutPrice() } }));
    for (const k of copies()) expect(order(k)).toEqual(['name', 'price']);
  });

  it('a design that failed to render is tried again once the draft changes (never stuck on built-in)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The compiled design reaches its views through TILE_VIEWS; the built-in tile calls them directly.
    const views = TILE_VIEWS as Record<string, ComponentType<PartViewProps>>;
    const Real = views.CardTileName!;
    let broken = true;
    views.CardTileName = (props) => { if (broken) throw new Error('boom'); return <Real {...props} />; };
    try {
      useEditorStore.setState({ docs: { 'card:tile': priceFirst() } });
      const { container } = mount('tile');
      const copies = () => [...container.querySelectorAll('[data-sf-part="product-grid"] > [aria-label]')];
      // Built-in (its name view is not the patched one): name before price.
      for (const k of copies()) expect(order(k)).toEqual(['name', 'price']);
      broken = false;
      await act(async () => useEditorStore.setState({ docs: { 'card:tile': priceFirst() } }));
      for (const k of copies()) expect(order(k)).toEqual(['price', 'name']);
    } finally {
      views.CardTileName = Real;
    }
  });
});

describe('CardStage kind="row"', () => {
  it('a rows list of li: the editable row, then the copies', () => {
    useEditorStore.setState({ docKey: 'card:row' });
    const { container } = mount('row');
    const ul = container.querySelector('ul')!;
    expect(ul.className).toContain(listClasses.rows);
    const items = [...ul.children];
    expect(items.map((li) => li.tagName)).toEqual(['LI', 'LI', 'LI', 'LI']);
    expect(items[0]!.querySelector('[data-probe]')).not.toBeNull();
    expect(items.slice(1).map((li) => li.getAttribute('aria-label'))).toEqual(['Out of stock', 'Pre-order, minimum 3', 'No photo']);
    for (const li of items.slice(1)) expect(li.hasAttribute('inert')).toBe(true);
  });
});

describe('draftCards', () => {
  it('prepared card docs by kind; none → undefined', () => {
    const shell = defaultDoc('shell', 'storefront')!;
    const row = defaultDoc('card:row', 'storefront')!;
    expect(draftCards({ shell, 'card:row': row })).toEqual({ row: prepareDoc(row) });
    expect(draftCards({ shell })).toBeUndefined();
    expect(draftCards({})).toBeUndefined();
  });
});
