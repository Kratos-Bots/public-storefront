import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { TrackingFamily } from '@/builder/family-tracking.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** The courier-stage rail of a single-parcel order. */
export const block = defineBlock<{ id: string }>({
  name: 'TrackingProgress', label: 'Progress', category: 'part', part: { family: 'tracking' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['tracking.status.*', 'tracking.parcel.awaitingScan'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <TrackingFamily.PartHost name="TrackingProgress" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
