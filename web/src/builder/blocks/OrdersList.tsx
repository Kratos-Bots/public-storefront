import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { ORDERS_CONTAINER } from '@/builder/blocks/_shared/orders-container.ts';
import type { ComponentData } from '@/builder/types.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const OrdersPage = lazy(() => import('@/features/account/OrdersPage.tsx').then((m) => ({ default: m.OrdersPage })));

/** The order history: a container of order-list parts. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'OrdersList', label: 'Order history', category: 'commerce', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: ['account.orders.loadFailedTitle', 'account.orders.loadFailedBody', 'account.nav.orders', 'common.actions.tryAgain', 'common.status.loading'],
  container: ORDERS_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <OrdersPage slots={{ content }} />,
});
