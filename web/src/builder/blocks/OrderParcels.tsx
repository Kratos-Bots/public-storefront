import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Every parcel sent for the order. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderParcels', label: 'Parcels', category: 'part', part: { family: 'order' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.order.parcels', 'account.order.parcelCount', 'account.order.parcelFallback', 'account.order.awaitingDispatch', 'account.order.shippedFallback', 'account.order.trackParcel', 'order.shipment.status.*', 'common.shipment.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderFamily.PartHost name="OrderParcels" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
