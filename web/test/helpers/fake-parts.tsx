import { z } from 'zod';
import { defineBlock, slot, type AnyBlock } from '@/builder/define.ts';
import { createFamily, part } from '@/builder/parts.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

export const FakeFamily = createFamily<{ label: string }>('product');
const shell = (name: string, extra: Partial<AnyBlock> = {}): AnyBlock => defineBlock<{ id: string }>({
  name, label: name.replace('Fake', ''), category: 'part', part: { family: 'product' }, layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]), schema: z.object({}), defaultProps: {},
  render: (p) => <FakeFamily.PartHost name={name} props={p as Record<string, unknown>} styleAttrs={p.puck.style} />, ...extra,
} as AnyBlock);

export const FAKE_BLOCKS: Record<string, AnyBlock> = {
  FakeBox: defineBlock<{ id: string; a: ComponentData[]; b: ComponentData[]; showNote: boolean }>({
    name: 'FakeBox', label: 'Fake box', category: 'product', layouts: 'all', routeBound: false, slots: ['a', 'b'],
    style: styleSupport('wrap', [...BOX]),
    schema: z.object({ a: slot(), b: slot(), showNote: z.boolean() }), defaultProps: { a: [], b: [], showNote: true },
    container: {
      family: 'product', insertSlot: 'a', legacyProps: ['showNote'],
      required: ['FakeTitle', 'FakePrice'], unique: ['FakeTitle', 'FakePrice', 'FakeAdd', 'FakeNote'],
      requires: [['FakeAdd', 'FakePrice']], slotAccepts: { b: ['FakeNote'] },
      defaultSlots: (props, { id }) => ({
        a: [part('FakeTitle', id), part('FakePrice', id), part('FakeAdd', id)],
        b: props.showNote === false ? [] : [part('FakeNote', id)],
      }),
    },
    render: ({ a, b }) => <div data-fake-box="">{a()}{b()}</div>,
  }) as AnyBlock,
  FakeTitle: shell('FakeTitle'),
  FakePrice: shell('FakePrice'),
  FakeAdd: shell('FakeAdd', { layouts: ['storefront'] }),
  FakeNote: shell('FakeNote', { style: styleSupport('root', [...BOX, ...VIS]) }),
  FakeGroup: defineBlock<{ id: string; items: ComponentData[] }>({
    name: 'FakeGroup', label: 'Group', category: 'part', part: { family: 'product' }, layouts: 'all', routeBound: false, slots: ['items'],
    style: styleSupport('root', ['align', ...VIS]), schema: z.object({ items: slot() }), defaultProps: { items: [] },
    render: ({ items }) => <div data-fake-group="">{items()}</div>,
  }) as AnyBlock,
};

/** `vi.mock('@/builder/registry.ts', withFakeBlocks)` — the real blocks plus the fakes. */
export async function withFakeBlocks(importOriginal: () => Promise<unknown>) {
  const real = (await importOriginal()) as { BLOCKS: Record<string, AnyBlock> };
  return { ...real, BLOCKS: { ...real.BLOCKS, ...FAKE_BLOCKS } };
}
