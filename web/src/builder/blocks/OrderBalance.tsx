import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The amount still owed; absent when the order is settled. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderBalance', label: 'Balance due', category: 'part', part: { family: 'order' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.order.balanceDue'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderFamily.PartHost name="OrderBalance" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
