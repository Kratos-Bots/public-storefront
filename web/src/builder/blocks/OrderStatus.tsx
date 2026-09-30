import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const OrderStatusPage = lazy(() => import('@/features/order-status/OrderStatusPage.tsx').then((m) => ({ default: m.OrderStatusPage })));

/** The shared order link's page: status, payment, items, address, shipments. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderStatus', label: 'Order status', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: ['order.*', 'common.shipment.*', 'common.dates.*', 'common.contact.*', 'common.totals.*', 'common.product.*', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <OrderStatusPage />,
});
