import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { TrackingFamily } from '@/builder/family-tracking.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** Every non-answer screen: waiting, error, blocked challenge, order not found. */
export const block = defineBlock<{ id: string }>({
  name: 'TrackingState', label: 'Status screens', category: 'part', part: { family: 'tracking' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: ['tracking.states.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <TrackingFamily.PartHost name="TrackingState" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
