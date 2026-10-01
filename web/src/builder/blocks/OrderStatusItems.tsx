import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderStatusFamily } from '@/builder/family-order-status.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** What was ordered and what it came to. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderStatusItems', label: 'Order items', category: 'part', part: { family: 'order-status' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['order.items.*', 'common.totals.*', 'common.promo.free', 'common.product.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderStatusFamily.PartHost name="OrderStatusItems" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
