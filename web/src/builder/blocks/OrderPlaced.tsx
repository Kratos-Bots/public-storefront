import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const OrderPlacedPage = lazy(() => import('@/features/payment-redirect/OrderPlacedPage.tsx').then((m) => ({ default: m.OrderPlacedPage })));

export const block = defineBlock<{ id: string }>({
  name: 'OrderPlaced', label: 'Order placed', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  text: ['payment.placed.*', 'payment.reference.*', 'payment.missing.*', 'order.copy.*', 'order.chat.*', 'order.link.*', 'common.contact.*', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <OrderPlacedPage />,
});
