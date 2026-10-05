import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { ORDER_CONTAINER } from '@/builder/blocks/_shared/order-container.ts';
import type { ComponentData } from '@/builder/types.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const OrderDetailPage = lazy(() => import('@/features/account/OrderDetailPage.tsx').then((m) => ({ default: m.OrderDetailPage })));

/** One order in full: a container of order parts. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'OrderDetail', label: 'Order detail', category: 'commerce', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: ['account.order.title', 'account.order.notFoundTitle', 'account.order.notFoundBody', 'account.order.allOrders',
    'account.order.loadFailedTitle', 'account.order.loadFailedBody', 'common.actions.tryAgain', 'common.status.loading'],
  container: ORDER_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content, puck }) => <OrderDetailPage slots={{ content }} ctx={puck} />,
});
