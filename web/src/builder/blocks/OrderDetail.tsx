import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const OrderDetailPage = lazy(() => import('@/features/account/OrderDetailPage.tsx').then((m) => ({ default: m.OrderDetailPage })));

export const block = defineBlock<{ id: string }>({
  name: 'OrderDetail', label: 'Order detail', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  text: ['account.order.*', 'account.nav.*', 'order.status.*', 'order.shipment.status.*', 'common.shipment.*', 'common.totals.*', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <OrderDetailPage />,
});
