import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderStatusFamily } from '@/builder/family-order-status.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** Everything about money owed: choose a method, finish a hosted checkout, send crypto. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderStatusPayment', label: 'Payment', category: 'part', part: { family: 'order-status' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: ['order.payment.*', 'order.method.*', 'order.crypto.*', 'order.errors.*', 'order.copy.*', 'order.chat.*', 'common.actions.*', 'common.contact.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderStatusFamily.PartHost name="OrderStatusPayment" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
