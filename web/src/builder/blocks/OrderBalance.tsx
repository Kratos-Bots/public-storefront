import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The amount still owed and the way to pay it, through the customer's session; absent when the order is settled. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderBalance', label: 'Balance due', category: 'part', part: { family: 'order' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.order.balanceDue', 'account.order.payHelp', 'order.payment.*', 'order.method.*', 'order.crypto.*', 'order.errors.*', 'order.copy.*', 'order.chat.payRequest', 'common.actions.*', 'common.contact.*', 'order.cancel.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderFamily.PartHost name="OrderBalance" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
