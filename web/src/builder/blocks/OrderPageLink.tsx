import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The link to the order's own page, where payment happens. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderPageLink', label: 'Order page link', category: 'part', part: { family: 'order' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX, ...TEXT, ...VIS]),
  text: ['account.order.openOrderPage', 'account.order.orderPageNote'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderFamily.PartHost name="OrderPageLink" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
