import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const OrderPlacedPage = lazy(() => import('@/features/payment-redirect/OrderPlacedPage.tsx').then((m) => ({ default: m.OrderPlacedPage })));

export const block = defineBlock<{ id: string }>({
  name: 'OrderPlaced', label: 'Order placed', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <OrderPlacedPage />,
});
