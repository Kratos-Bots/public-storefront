import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { TrackingFamily } from '@/builder/family-tracking.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** One card per parcel, or the nothing-shipped note. */
export const block = defineBlock<{ id: string }>({
  name: 'TrackingParcels', label: 'Parcels', category: 'part', part: { family: 'tracking' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: ['tracking.states.*', 'tracking.parcel.*', 'tracking.timeline.*', 'tracking.status.*', 'tracking.time.*', 'common.shipment.*', 'common.dates.*', 'common.status.*', 'common.actions.*', 'order.status.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <TrackingFamily.PartHost name="TrackingParcels" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
