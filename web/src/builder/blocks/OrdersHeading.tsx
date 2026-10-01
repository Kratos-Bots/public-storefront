import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrdersFamily } from '@/builder/family-orders.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The order history's title and count. */
export const block = defineBlock<{ id: string }>({
  name: 'OrdersHeading', label: 'Orders heading', category: 'part', part: { family: 'orders' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.orders.title', 'account.orders.count'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrdersFamily.PartHost name="OrdersHeading" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
