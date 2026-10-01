import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { ORDER_STATUS_CONTAINER } from '@/builder/blocks/_shared/order-status-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const OrderStatusPage = lazy(() => import('@/features/order-status/OrderStatusPage.tsx').then((m) => ({ default: m.OrderStatusPage })));

/** The shared order link's page: a container of order-status parts (hero, payment, tracking, items, address, footer). */
export const block = defineBlock<{ id: string; top: ComponentData[]; action: ComponentData[]; summary: ComponentData[]; bottom: ComponentData[] }>({
  name: 'OrderStatus', label: 'Order status', category: 'post-order', layouts: 'all', routeBound: true, slots: ['top', 'action', 'summary', 'bottom'],
  style: styleSupport('wrap', [...BOX]),
  // Its parts list the order.* keys they draw; what is left is the loading / invalid-link screens and the tab title.
  text: ['order.documentTitle', 'order.screens.*', 'order.link.*', 'common.actions.tryAgain', 'common.contact.*'],
  container: ORDER_STATUS_CONTAINER,
  schema: z.object({ top: slot(), action: slot(), summary: slot(), bottom: slot() }),
  defaultProps: { top: [], action: [], summary: [], bottom: [] },
  render: ({ top, action, summary, bottom }) => <OrderStatusPage slots={{ top, action, summary, bottom }} />,
});
