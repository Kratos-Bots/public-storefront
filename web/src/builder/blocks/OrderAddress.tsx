import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Where the order is going: the delivery address, or the collection point. Absent when the order has no address. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderAddress', label: 'Delivery address', category: 'part', part: { family: 'order' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.order.address.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderFamily.PartHost name="OrderAddress" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
