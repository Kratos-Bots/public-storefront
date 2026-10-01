import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrdersFamily } from '@/builder/family-orders.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The button that loads older orders. */
export const block = defineBlock<{ id: string }>({
  name: 'OrdersMore', label: 'Load more', category: 'part', part: { family: 'orders' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.orders.loadMore', 'account.orders.loadingMore'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrdersFamily.PartHost name="OrdersMore" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
