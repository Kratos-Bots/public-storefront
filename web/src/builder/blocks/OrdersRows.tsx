import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrdersFamily } from '@/builder/family-orders.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The ruled list of orders. */
export const block = defineBlock<{ id: string }>({
  name: 'OrdersRows', label: 'Order rows', category: 'part', part: { family: 'orders' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['account.orders.balanceDue', 'order.status.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrdersFamily.PartHost name="OrdersRows" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
