import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { z } from 'zod';
import { CARD_KINDS, cardKey, cardKind, isCardKey, type ComponentData } from '@/builder/types.ts';
import { containsType, createFamily, FAMILY_DOC, fixedSlot, group, NO_SILENT, part, partId, slotShows } from '@/builder/parts.ts';
import { defaultSlotRenders, slotRender, slotRenders } from '@/builder/render.tsx';
import { EditorBlock } from '@/builder/editor/EditorBlock.tsx';
import { defineBlock, slot, type SlotRender } from '@/builder/define.ts';

const puck = vi.hoisted(() => ({ item: null as ComponentData | null }));
vi.mock('@/builder/editor/use-puck.ts', () => ({
  usePuck: (sel: (s: { getItemById: (id: string) => unknown }) => unknown) => sel({ getItemById: () => puck.item }),
  useGetPuck: () => () => ({}),
}));

const c = (type: string, id = type, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
const ctx = { editing: false, docKey: 'product' as const, layout: 'storefront' as const };

describe('card keys', () => {
  it('names the two kinds and their doc keys', () => {
    expect([...CARD_KINDS]).toEqual(['tile', 'row']);
    expect(cardKey('tile')).toBe('card:tile');
    expect(cardKind('card:row')).toBe('row');
    expect(['card:tile', 'card:row'].every(isCardKey)).toBe(true);
    expect(['card:grid', 'cards', 'card:', 'catalog', 'page:card'].some(isCardKey)).toBe(false);
  });
  it('maps every family to the doc its container lives on (spec §3.4)', () => {
    expect(FAMILY_DOC).toEqual({ product: 'product', catalogue: 'catalog', 'card-tile': 'card:tile', 'card-row': 'card:row' });
  });
});

describe('slotShows / containsType', () => {
  it('slotShows: true when something outside `silent` is there', () => {
    expect(slotShows([], NO_SILENT)).toBe(false);
    expect(slotShows([c('ProductGallery')], new Set(['ProductGallery']))).toBe(false);
    expect(slotShows([c('ProductGallery'), c('RichText')], new Set(['ProductGallery']))).toBe(true);
    expect(slotShows([c('ProductGallery')], NO_SILENT)).toBe(true);
  });
  it('containsType: depth-first through component arrays, not other props', () => {
    const tree = [c('Section', 's', { content: [c('Columns', 'k', { col1: [], col2: [c('CatalogCategories', 'cc')] })] })];
    expect(containsType(tree, 'CatalogCategories')).toBe(true);
    expect(containsType(tree, 'Heading')).toBe(false);
    // An array prop of plain rows (FAQ items) is never read as components.
    expect(containsType([c('FAQ', 'f', { items: [{ question: 'CatalogCategories', answerHtml: '' }] })], 'CatalogCategories')).toBe(false);
  });
});

describe('ids and default-slot helpers', () => {
  it('partId keeps ≤ 64 chars for the longest container id and key', () => {
    expect(partId('ProductDetail-default', 'ProductTitle')).toBe('ProductDetail-default-ProductTitle');
    expect(partId('x'.repeat(64), 'group-identityText').length).toBeLessThanOrEqual(64);
    expect(partId('x'.repeat(64), 'ProductBreadcrumbs').length).toBeLessThanOrEqual(64);
  });
  it('part / group build sparse components', () => {
    expect(part('ProductPrice', 'd')).toEqual({ type: 'ProductPrice', props: { id: 'd-ProductPrice' } });
    expect(group('ProductGroup', 'd', 'priceRow', [part('ProductPrice', 'd')])).toEqual({
      type: 'ProductGroup', props: { id: 'd-group-priceRow', kind: 'priceRow', items: [{ type: 'ProductPrice', props: { id: 'd-ProductPrice' } }] },
    });
  });
});

describe('createFamily', () => {
  const Fam = createFamily<{ name: string }>('product');
  const View = ({ props, styleAttrs }: { props: Record<string, unknown>; styleAttrs?: Record<string, string> }) => {
    const { name } = Fam.useData();
    return <p {...styleAttrs}>{`${name}:${String(props.kind ?? '')}`}</p>;
  };
  it('PartHost renders null with no container above it (spec §3.2)', () => {
    const { container } = render(<Fam.PartHost name="View" props={{}} />);
    expect(container.innerHTML).toBe('');
  });
  it('PartHost renders the view the container hands down, with the part props and style attributes', () => {
    const { container } = render(
      <Fam.Provider value={{ data: { name: 'Oats' }, views: { View } }}>
        <Fam.PartHost name="View" props={{ kind: 'x' }} styleAttrs={{ 'data-sf-style': 'View', 'data-sfs-bg': 'surface' }} />
        <Fam.PartHost name="Missing" props={{}} />
        <Fam.PartHost name="constructor" props={{}} />
      </Fam.Provider>,
    );
    expect(container.innerHTML).toBe('<p data-sf-style="View" data-sfs-bg="surface">Oats:x</p>');
  });
  it('useData throws outside a container', () => {
    const Bad = () => <>{Fam.useData().name}</>;
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<Bad />)).toThrow(/outside its container/);
    } finally {
      quiet.mockRestore();
    }
  });
});

describe('slot items (spec §3.2)', () => {
  it('slotRender attaches the stored items and still renders bare or with one wrapper', () => {
    const s = slotRender([c('Spacer', 'sp', { size: 'sm' })], ctx);
    expect(s.items.map((i) => i.props.id)).toEqual(['sp']);
    expect(slotRender(undefined, ctx).items).toEqual([]);
    const { container } = render(<>{s({ className: 'col' })}</>);
    expect(container.firstElementChild?.className).toBe('col');
  });
  it('slotRenders maps each slot', () => {
    const out = slotRenders({ a: [c('Spacer', 'x', { size: 'sm' })], b: [] }, ctx);
    expect(Object.keys(out)).toEqual(['a', 'b']);
    expect(out.a!.items).toHaveLength(1);
  });
  it('fixedSlot renders its children bare, or in one element', () => {
    const s = fixedSlot(createElement('i', null, 'x'));
    expect(s.items).toEqual([]);
    expect(render(<>{s()}</>).container.innerHTML).toBe('<i>x</i>');
    expect(render(<>{s({ className: 'w' })}</>).container.innerHTML).toBe('<div class="w"><i>x</i></div>');
  });
  it('defaultSlotRenders is empty for a block without a container', () => {
    expect(defaultSlotRenders('Heading', 'storefront')).toEqual({});
  });
});

describe('EditorBlock attaches stored slot items (Review Focus 2)', () => {
  it('a slotted block reads its slot arrays from Puck and hands them to render as `items`', () => {
    const seen: string[][] = [];
    const def = defineBlock<{ id: string; a: ComponentData[] }>({
      name: 'Probe', label: 'Probe', category: 'content', layouts: 'all', routeBound: false, slots: ['a'], style: false,
      schema: z.object({ a: slot() }), defaultProps: { a: [] },
      render: ({ a }) => { seen.push((a as SlotRender).items.map((i) => i.props.id)); return <>{a()}</>; },
    });
    puck.item = c('Probe', 'p1', { a: [c('Spacer', 's1'), c('Spacer', 's2')] });
    const puckSlot = () => null;
    render(<EditorBlock def={def} props={{ id: 'p1', a: puckSlot }} docKey="page:x" layout="storefront" />);
    expect(seen.at(-1)).toEqual(['s1', 's2']);
  });
  it('a block without slots never touches Puck (renders outside <Puck> in tests)', () => {
    puck.item = null;
    const def = defineBlock<{ id: string }>({
      name: 'Flat', label: 'Flat', category: 'content', layouts: 'all', routeBound: false, slots: [], style: false,
      schema: z.object({}), defaultProps: {}, render: () => <b>flat</b>,
    });
    expect(render(<EditorBlock def={def} props={{ id: 'f' }} docKey="page:x" layout="storefront" />).container.textContent).toContain('flat');
  });
});
