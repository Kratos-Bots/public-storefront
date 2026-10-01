import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderStatusFamily } from '@/builder/family-order-status.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** One card per parcel, with its carrier and tracking link. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderStatusShipments', label: 'Tracking', category: 'part', part: { family: 'order-status' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: ['order.shipment.*', 'common.shipment.*', 'order.dates.*', 'common.dates.*', 'order.copy.*', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderStatusFamily.PartHost name="OrderStatusShipments" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
