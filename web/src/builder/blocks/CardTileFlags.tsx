import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CardTileFamily } from '@/builder/families.ts';
import { BOX, styleSupport, TEXT, VIS } from '@/builder/style/model.ts';

/** Minimum order, pre-order and stock flags (nothing when none applies). */
export const block = defineBlock<{ id: string }>({
  name: 'CardTileFlags', label: 'Flags', category: 'part', part: { family: 'card-tile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['product.limit.min', 'common.product.preorder', 'common.promo.more', 'product.stock.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CardTileFamily.PartHost name="CardTileFlags" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
