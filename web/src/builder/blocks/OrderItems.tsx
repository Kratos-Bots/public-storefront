import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** What was bought, with subtotal, shipping, discount and total. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderItems', label: 'Items and totals', category: 'part', part: { family: 'order' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['account.order.items', 'account.order.lines', 'common.totals.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderFamily.PartHost name="OrderItems" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
