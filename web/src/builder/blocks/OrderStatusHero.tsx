import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderStatusFamily } from '@/builder/family-order-status.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** A one-line headline and the four-step route showing where the order is. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderStatusHero', label: 'Order status', category: 'part', part: { family: 'order-status' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['order.hero.*', 'order.status.*', 'order.steps.*', 'order.dates.*', 'common.dates.*', 'common.shipment.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderStatusFamily.PartHost name="OrderStatusHero" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
