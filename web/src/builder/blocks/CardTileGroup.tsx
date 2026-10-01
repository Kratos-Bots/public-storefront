import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { CardTileFamily } from '@/builder/families.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

/** A wrapper inside the tile: the card body (name to price) or its foot (price and add). */
export const block = defineBlock<{ id: string; kind: 'body' | 'foot'; items: ComponentData[] }>({
  name: 'CardTileGroup', label: 'Group', category: 'part', part: { family: 'card-tile' }, layouts: 'all', routeBound: false, slots: ['items'],
  style: styleSupport('root', [...BOX, 'align', ...VIS]),
  schema: z.object({ kind: z.enum(['body', 'foot']), items: slot() }),
  defaultProps: { kind: 'body', items: [] },
  render: (p) => <CardTileFamily.PartHost name="CardTileGroup" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
