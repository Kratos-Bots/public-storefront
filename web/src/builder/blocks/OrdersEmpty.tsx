import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrdersFamily } from '@/builder/family-orders.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** What shows when there are no orders yet. */
export const block = defineBlock<{ id: string }>({
  name: 'OrdersEmpty', label: 'No orders message', category: 'part', part: { family: 'orders' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['account.orders.emptyTitle', 'account.orders.emptyBody', 'account.nav.orders', 'common.actions.browseCatalogue'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrdersFamily.PartHost name="OrdersEmpty" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
