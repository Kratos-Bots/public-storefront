// web/test/builder-editor-container-panel.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentData } from '@/builder/types.ts';

// Puck mocked: the panel reads the selected item, dispatches, and looks up the item's selector.
const puck = vi.hoisted(() => ({
  selectedItem: null as ComponentData | null,
  /** What Puck holds now (getItemBySelector); null = the selected item. */
  current: null as ComponentData | null,
  content: [] as ComponentData[],
  dispatch: vi.fn(),
  getSelectorForId: vi.fn((_id: string) => ({ index: 0, zone: undefined as string | undefined })),
}));
vi.mock('@/builder/editor/use-puck.ts', () => ({
  usePuck: (sel: (s: unknown) => unknown) => sel({ selectedItem: puck.selectedItem, dispatch: puck.dispatch }),
  useGetPuck: () => () => ({
    getSelectorForId: puck.getSelectorForId,
    getItemBySelector: () => puck.current ?? puck.selectedItem,
    appState: { data: { content: puck.content } },
  }),
}));
const settings = vi.hoisted(() => ({ wholesale: false }));
vi.mock('@/app/settings.ts', () => ({
  useSettingsQuery: () => ({ data: { features: { wholesale: settings.wholesale } } }),
}));

import { defaultDoc } from '@/builder/defaults/index.ts';
import { containsType } from '@/builder/parts.ts';
import { DEFAULT_PREVIEW_AS, TEXT_INITIAL, useEditorStore } from '@/builder/editor/store.ts';
import { CARD_LINKS, ownerBlockCount, partStates, withDefaultArrangement, withPartAdded } from '@/builder/editor/container-parts.ts';
import { ContainerPanel } from '@/builder/editor/ContainerPanel.tsx';

const items = (v: unknown) => v as ComponentData[];
const types = (v: unknown) => items(v).map((c) => c.type);
const productDetail = (layout: 'storefront' | 'menu' = 'storefront') => defaultDoc('product', layout)!.content[0]!;
/** The storefront product container with Description and Bulk pricing taken out of `main`. */
function trimmed(): ComponentData {
  const pd = productDetail();
  const main = items(pd.props.main).filter((c) => c.type !== 'ProductDescription' && c.type !== 'ProductBulkPricing');
  return { ...pd, props: { ...pd.props, main, sku: 'hide' } };
}
const allIds = (content: readonly ComponentData[]): Set<string> => {
  const out = new Set<string>();
  const walk = (list: readonly ComponentData[]) => {
    for (const c of list) {
      out.add(String(c.props.id));
      for (const v of Object.values(c.props)) if (Array.isArray(v)) walk(v as ComponentData[]);
    }
  };
  walk(content);
  return out;
};

describe('container parts (pure)', () => {
  it('partStates: every part in default order, groups left out, with present / required', () => {
    const item = trimmed();
    const states = partStates(item, 'storefront');
    expect(states.map((s) => s.type)).toEqual(['ProductBreadcrumbs', 'ProductGallery', 'ProductTitle', 'ProductPrice', 'ProductStock',
      'ProductAddToCart', 'ProductDescription', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk', 'ProductUpsells', 'ProductCoa']);
    const by = Object.fromEntries(states.map((s) => [s.type, s]));
    expect(by.ProductDescription!.present).toBe(false);
    expect(by.ProductBulkPricing!.present).toBe(false);
    // Drawn by the container itself until the owner places it, so no default arrangement holds it.
    expect(by.ProductCoa).toMatchObject({ present: false, required: false });
    expect(by.ProductTitle).toMatchObject({ present: true, required: true, label: 'Title' });
    expect(by.ProductAsk).toMatchObject({ present: true, required: false });
    expect(states.some((s) => s.type === 'ProductGroup')).toBe(false);
  });

  it('partStates in the menu layout leaves out the add to cart button', () => {
    const states = partStates(productDetail('menu'), 'menu');
    expect(states.map((s) => s.type)).not.toContain('ProductAddToCart');
    expect(states.every((s) => s.present || s.type === 'ProductBreadcrumbs' || s.type === 'ProductCoa')).toBe(true);
  });

  it('partStates of a non-container is empty', () => {
    expect(partStates({ type: 'RichText', props: { id: 'r' } }, 'storefront')).toEqual([]);
  });

  it('withPartAdded: after the nearest default predecessor present, else at the start of the default slot', () => {
    const item = trimmed();
    const withBulk = withPartAdded(item, 'ProductBulkPricing', 'storefront', allIds([item]));
    expect(types(withBulk.props.main)).toEqual(['ProductTitle', 'ProductGroup', 'ProductAddToCart', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk']);
    const both = withPartAdded(withBulk, 'ProductDescription', 'storefront', allIds([withBulk]));
    expect(types(both.props.main)).toEqual(['ProductTitle', 'ProductGroup', 'ProductAddToCart', 'ProductDescription', 'ProductBulkPricing',
      'ProductProvenance', 'ProductAsk']);
    const added = items(both.props.main).find((c) => c.type === 'ProductDescription')!;
    expect(added.props.id).toBe(`${item.props.id}-ProductDescription`);
    expect(both.props.sku).toBe('hide');

    const noCrumbs = { ...item, props: { ...item.props, top: [{ type: 'RichText', props: { id: 'note' } }] } };
    const back = withPartAdded(noCrumbs, 'ProductBreadcrumbs', 'storefront', allIds([noCrumbs]));
    expect(types(back.props.top)).toEqual(['ProductBreadcrumbs', 'RichText']);
  });

  it('withPartAdded finds a predecessor inside a group but stays at the depth the default puts the part', () => {
    const pd = productDetail();
    // Take AddToCart out: Description's nearest present predecessor is Stock, inside the price row
    // group. Description sits at the top of `main` by default, so it lands after the group, not in it.
    const main = items(pd.props.main).filter((c) => c.type !== 'ProductAddToCart' && c.type !== 'ProductDescription');
    const item = { ...pd, props: { ...pd.props, main } };
    const next = withPartAdded(item, 'ProductDescription', 'storefront', allIds([item]));
    expect(types(next.props.main)).toEqual(['ProductTitle', 'ProductGroup', 'ProductDescription', 'ProductBulkPricing', 'ProductProvenance', 'ProductAsk']);
    const row = items(next.props.main).find((c) => c.type === 'ProductGroup')!;
    expect(types(row.props.items)).toEqual(['ProductPrice', 'ProductStock']);
  });

  it('withPartAdded goes into a group when the default puts it there (menu sheet photo)', () => {
    const pd = productDetail('menu');
    const strip = (list: ComponentData[]): ComponentData[] => list.filter((c) => c.type !== 'ProductGallery')
      .map((c) => (Array.isArray(c.props.items) ? { ...c, props: { ...c.props, items: strip(items(c.props.items)) } } : c));
    const item = { ...pd, props: { ...pd.props, main: strip(items(pd.props.main)) } };
    expect(containsType(items(item.props.main), 'ProductGallery')).toBe(false);
    const next = withPartAdded(item, 'ProductGallery', 'menu', allIds([item]));
    expect(next.props.main).toEqual(pd.props.main);
  });

  it('withPartAdded suffixes a taken id with -2, -3…', () => {
    const item = trimmed();
    const base = `${item.props.id}-ProductDescription`;
    const once = withPartAdded(item, 'ProductDescription', 'storefront', new Set([base]));
    expect(items(once.props.main).find((c) => c.type === 'ProductDescription')!.props.id).toBe(`${base}-2`);
    const twice = withPartAdded(item, 'ProductDescription', 'storefront', new Set([base, `${base}-2`]));
    expect(items(twice.props.main).find((c) => c.type === 'ProductDescription')!.props.id).toBe(`${base}-3`);
  });

  it('withPartAdded does not mutate its input', () => {
    const item = trimmed();
    const before = JSON.stringify(item);
    withPartAdded(item, 'ProductDescription', 'storefront', new Set());
    expect(JSON.stringify(item)).toBe(before);
  });

  it('withDefaultArrangement restores the four slots and keeps the container props', () => {
    const item = { ...trimmed(), props: { ...trimmed().props, top: [], below: [{ type: 'RichText', props: { id: 'x' } }] } };
    const reset = withDefaultArrangement(item, 'storefront');
    const pd = productDetail();
    for (const s of ['top', 'media', 'main', 'below']) expect(reset.props[s]).toEqual(pd.props[s]);
    expect(reset.props.sku).toBe('hide');
    expect(reset.props.id).toBe(item.props.id);
  });

  it('CARD_LINKS names the card designs each block links to', () => {
    expect(CARD_LINKS.ProductGrid!.map((l) => l.key)).toEqual(['card:tile', 'card:row']);
    expect(CARD_LINKS.ProductList!.map((l) => l.key)).toEqual(['card:row']);
    expect(CARD_LINKS.FeaturedProducts!.map((l) => l.label)).toEqual(['Edit card design']);
    expect(CARD_LINKS.ProductUpsells!.map((l) => l.label)).toEqual(['Edit card design', 'Edit row design']);
    expect(CARD_LINKS.Upsells!.map((l) => l.key)).toEqual(['card:tile', 'card:row']);
  });
});

describe('<ContainerPanel />', () => {
  beforeEach(() => {
    useEditorStore.setState({ status: 'ready', layout: 'storefront', readOnly: false, docs: {}, docKey: 'product', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: null, ...TEXT_INITIAL });
    puck.selectedItem = null;
    puck.current = null;
    puck.content = [];
    puck.dispatch.mockReset();
    // Like Puck: the replaced item becomes the selected one.
    puck.dispatch.mockImplementation((a: { data: ComponentData }) => { puck.selectedItem = a.data; puck.content = [a.data]; });
    puck.getSelectorForId.mockReset();
    puck.getSelectorForId.mockImplementation(() => ({ index: 0, zone: undefined }));
    settings.wholesale = false;
  });
  afterEach(cleanup);

  const select = (item: ComponentData) => { puck.selectedItem = item; puck.content = [item]; };

  it('lists the parts of the selected container with their state', () => {
    select(trimmed());
    render(<ContainerPanel />);
    expect(screen.getByRole('region', { name: 'Parts' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Parts' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(12);
    const row = (label: string) => rows.find((r) => within(r).queryByText(label))!;
    expect(within(row('Description')).getByText('Removed')).toBeInTheDocument();
    expect(within(row('Ask a question')).getByText('On the page')).toBeInTheDocument();
    expect(within(row('Title')).getByText('Required')).toBeInTheDocument();
    expect(within(row('Title')).queryByRole('button')).toBeNull();
    expect(within(row('Ask a question')).queryByRole('button')).toBeNull();
  });

  it('Add dispatches one replace with the part inserted', () => {
    const item = trimmed();
    select(item);
    puck.getSelectorForId.mockImplementation(() => ({ index: 2, zone: undefined }));
    render(<ContainerPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Bulk pricing' }));
    expect(puck.dispatch).toHaveBeenCalledTimes(1);
    expect(puck.getSelectorForId).toHaveBeenCalledWith(item.props.id);
    expect(puck.dispatch).toHaveBeenCalledWith({
      type: 'replace', destinationIndex: 2, destinationZone: 'root:default-zone',
      data: withPartAdded(item, 'ProductBulkPricing', 'storefront', allIds([item])),
    });
  });

  it('Add keeps the zone of a nested container', () => {
    const item = trimmed();
    select(item);
    puck.getSelectorForId.mockImplementation(() => ({ index: 1, zone: 'sec-1:items' }));
    render(<ContainerPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Description' }));
    expect(puck.dispatch.mock.calls[0]![0]).toMatchObject({ destinationIndex: 1, destinationZone: 'sec-1:items' });
  });

  it('Reset arrangement dispatches one replace with the default arrangement', () => {
    const item = trimmed();
    select(item);
    render(<ContainerPanel />);
    const reset = screen.getByRole('button', { name: 'Reset arrangement' });
    expect(reset).toHaveAccessibleDescription('Puts every part back where it starts. Your content blocks inside are removed; settings are kept.');
    fireEvent.click(reset);
    expect(puck.dispatch).toHaveBeenCalledTimes(1);
    expect(puck.dispatch).toHaveBeenCalledWith({
      type: 'replace', destinationIndex: 0, destinationZone: 'root:default-zone', data: withDefaultArrangement(item, 'storefront'),
    });
  });

  it('Add moves focus to the added part and announces it', () => {
    select(trimmed());
    render(<ContainerPanel />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: 'Add Bulk pricing' }));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveTextContent('Bulk pricing');
    expect(status).toHaveTextContent('Bulk pricing added');
  });

  it('Reset keeps focus on the button and announces it', () => {
    select(trimmed());
    render(<ContainerPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset arrangement' }));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reset arrangement' }));
    expect(screen.getByRole('status')).toHaveTextContent('Arrangement reset');
  });

  it('Add and Reset read the item Puck holds at click time, not the rendered one', () => {
    const item = trimmed();
    select(item);
    render(<ContainerPanel />);
    const newer = { ...item, props: { ...item.props, sku: 'show' } };
    puck.current = newer;
    fireEvent.click(screen.getByRole('button', { name: 'Add Description' }));
    expect(puck.dispatch.mock.calls[0]![0].data).toEqual(withPartAdded(newer, 'ProductDescription', 'storefront', allIds([item])));
    puck.current = newer;
    fireEvent.click(screen.getByRole('button', { name: 'Reset arrangement' }));
    expect(puck.dispatch.mock.calls[1]![0].data).toEqual(withDefaultArrangement(newer, 'storefront'));
  });

  it("Reset warns how many of the owner's blocks it removes, in one replace", () => {
    const pd = trimmed();
    const section = { type: 'Section', props: { id: 's1', content: [{ type: 'RichText', props: { id: 'r1' } }] } };
    const item = { ...pd, props: { ...pd.props, below: [section, { type: 'Heading', props: { id: 'h1' } }] } };
    expect(ownerBlockCount(item)).toBe(3);
    select(item);
    render(<ContainerPanel />);
    const reset = screen.getByRole('button', { name: 'Reset arrangement' });
    expect(screen.getByText('Also removes 3 blocks you added')).toBeInTheDocument();
    expect(reset).toHaveAccessibleDescription(/Also removes 3 blocks you added/);
    fireEvent.click(reset);
    expect(puck.dispatch).toHaveBeenCalledTimes(1);
  });

  it('Reset with one owner block uses the singular; none shows no warning', () => {
    const pd = trimmed();
    expect(ownerBlockCount(pd)).toBe(0);
    select({ ...pd, props: { ...pd.props, below: [{ type: 'Heading', props: { id: 'h1' } }] } });
    render(<ContainerPanel />);
    expect(screen.getByText('Also removes 1 block you added')).toBeInTheDocument();
    cleanup();
    select(pd);
    render(<ContainerPanel />);
    expect(screen.queryByText(/Also removes/)).toBeNull();
  });

  it('dispatches nothing when the item has no selector', () => {
    select(trimmed());
    puck.getSelectorForId.mockImplementation(() => undefined as never);
    render(<ContainerPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset arrangement' }));
    expect(puck.dispatch).not.toHaveBeenCalled();
  });

  it('renders nothing for a non-container or no selection', () => {
    select({ type: 'RichText', props: { id: 'r', text: '' } });
    const { container } = render(<ContainerPanel />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    puck.selectedItem = null;
    const again = render(<ContainerPanel />);
    expect(again.container).toBeEmptyDOMElement();
  });

  it('with wholesale mode on, a catalogue container shows the wholesale notice', () => {
    settings.wholesale = true;
    useEditorStore.setState({ docKey: 'catalog' });
    select(defaultDoc('catalog', 'storefront')!.content.find((c) => c.type === 'ProductGrid')!);
    render(<ContainerPanel />);
    expect(screen.getByRole('note')).toHaveTextContent('Wholesale mode is on: shoppers see the trade list here. This arrangement shows when wholesale mode is off.');
  });

  it('with wholesale mode on, a product list shows the wholesale notice too', () => {
    settings.wholesale = true;
    useEditorStore.setState({ docKey: 'catalog' });
    const list = { type: 'ProductList', props: { id: 'pl', content: [] } };
    select(list);
    render(<ContainerPanel />);
    expect(screen.getByRole('note')).toHaveTextContent('Wholesale mode is on: shoppers see the trade list here. This arrangement shows when wholesale mode is off.');
  });

  it('without wholesale mode there is no wholesale notice', () => {
    useEditorStore.setState({ docKey: 'catalog' });
    select(defaultDoc('catalog', 'storefront')!.content.find((c) => c.type === 'ProductGrid')!);
    render(<ContainerPanel />);
    expect(screen.queryByText(/Wholesale mode is on/)).toBeNull();
  });

  it('in the menu layout the product container explains the pinned add to cart button', () => {
    useEditorStore.setState({ layout: 'menu' });
    select(productDetail('menu'));
    render(<ContainerPanel />);
    expect(screen.getByRole('note')).toHaveTextContent("In the menu and web app the add to cart button is pinned to the sheet's footer, within thumb reach, so it isn't part of this arrangement.");
    expect(screen.queryByText('Add to cart button')).toBeNull();
  });

  it('the storefront product container has no pinned-button notice', () => {
    select(productDetail());
    render(<ContainerPanel />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('ProductGrid links to both card designs; clicking opens the card document', () => {
    useEditorStore.setState({ docKey: 'catalog' });
    select(defaultDoc('catalog', 'storefront')!.content.find((c) => c.type === 'ProductGrid')!);
    const selectDoc = vi.spyOn(useEditorStore.getState(), 'selectDoc');
    render(<ContainerPanel />);
    expect(screen.getByRole('button', { name: 'Edit row design' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit card design' }));
    expect(selectDoc).toHaveBeenCalledWith('card:tile');
    selectDoc.mockRestore();
  });

  it('a non-container with card links shows only the links', () => {
    select({ type: 'FeaturedProducts', props: { id: 'f' } });
    render(<ContainerPanel />);
    expect(screen.getByRole('button', { name: 'Edit card design' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Parts' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit row design' })).toBeNull();
  });
});
