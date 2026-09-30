import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const OrdersPage = lazy(() => import('@/features/account/OrdersPage.tsx').then((m) => ({ default: m.OrdersPage })));

export const block = defineBlock<{ id: string }>({
  name: 'OrdersList', label: 'Order history', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  text: ['account.orders.*', 'account.nav.*', 'order.status.*', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <OrdersPage />,
});
