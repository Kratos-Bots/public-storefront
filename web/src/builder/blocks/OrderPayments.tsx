import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Every payment made against the order. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderPayments', label: 'Payments', category: 'part', part: { family: 'order' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.order.payments'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderFamily.PartHost name="OrderPayments" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
