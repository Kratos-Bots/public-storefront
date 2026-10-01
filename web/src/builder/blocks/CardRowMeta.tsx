import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CardRowFamily } from '@/builder/families.ts';
import { BOX, styleSupport, TEXT, VIS } from '@/builder/style/model.ts';

/** Code, minimum, bulk rung, pre-order and stock on one quiet line. */
export const block = defineBlock<{ id: string }>({
  name: 'CardRowMeta', label: 'Details', category: 'part', part: { family: 'card-row' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['product.limit.min', 'common.product.preorder', 'common.promo.more', 'product.stock.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CardRowFamily.PartHost name="CardRowMeta" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
