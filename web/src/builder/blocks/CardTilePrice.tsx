import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CardTileFamily } from '@/builder/families.ts';
import { BOX, styleSupport, TEXT, VIS } from '@/builder/style/model.ts';

/** The price and the lowest bulk rung. */
export const block = defineBlock<{ id: string }>({
  name: 'CardTilePrice', label: 'Price', category: 'part', part: { family: 'card-tile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  schema: z.object({}), defaultProps: {},
  render: (p) => <CardTileFamily.PartHost name="CardTilePrice" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
