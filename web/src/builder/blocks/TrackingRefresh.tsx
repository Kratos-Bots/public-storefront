import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { TrackingFamily } from '@/builder/family-tracking.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** How fresh the answer is, and the control that makes it fresher. */
export const block = defineBlock<{ id: string }>({
  name: 'TrackingRefresh', label: 'Refresh', category: 'part', part: { family: 'tracking' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['tracking.refresh.*', 'tracking.time.*', 'common.status.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <TrackingFamily.PartHost name="TrackingRefresh" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
