import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { TrackingFamily } from '@/builder/family-tracking.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** Said when live courier tracking is unavailable but parcels exist. */
export const block = defineBlock<{ id: string }>({
  name: 'TrackingNotice', label: 'Degraded notice', category: 'part', part: { family: 'tracking' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['tracking.states.degradedHead', 'tracking.states.degradedBody'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <TrackingFamily.PartHost name="TrackingNotice" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
