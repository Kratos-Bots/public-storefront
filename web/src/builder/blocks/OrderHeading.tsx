import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The order reference, its status and the date it was placed. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderHeading', label: 'Order heading', category: 'part', part: { family: 'order' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['account.order.placed', 'account.order.collectFrom', 'order.status.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderFamily.PartHost name="OrderHeading" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
