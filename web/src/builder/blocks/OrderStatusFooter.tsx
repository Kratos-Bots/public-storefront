import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderStatusFamily } from '@/builder/family-order-status.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The order reference and the chat links. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderStatusFooter', label: 'Order reference', category: 'part', part: { family: 'order-status' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['order.footer.*', 'order.chat.*', 'common.contact.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderStatusFamily.PartHost name="OrderStatusFooter" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
