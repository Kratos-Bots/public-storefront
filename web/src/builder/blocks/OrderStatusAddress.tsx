import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderStatusFamily } from '@/builder/family-order-status.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Where the order is going. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderStatusAddress', label: 'Shipping address', category: 'part', part: { family: 'order-status' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['order.address.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderStatusFamily.PartHost name="OrderStatusAddress" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
