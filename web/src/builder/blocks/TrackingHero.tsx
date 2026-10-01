import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { TrackingFamily } from '@/builder/family-tracking.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The status headline and the facts the lookup knows (placed, items, last scan). */
export const block = defineBlock<{ id: string }>({
  name: 'TrackingHero', label: 'Order status', category: 'part', part: { family: 'tracking' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: ['tracking.hero.*', 'tracking.time.*', 'tracking.status.*', 'order.status.*', 'common.dates.*', 'common.product.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <TrackingFamily.PartHost name="TrackingHero" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
