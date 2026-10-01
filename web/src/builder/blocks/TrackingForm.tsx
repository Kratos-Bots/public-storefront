import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { TrackingFamily } from '@/builder/family-tracking.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The reference form: the only way to look an order up. */
export const block = defineBlock<{ id: string }>({
  name: 'TrackingForm', label: 'Lookup form', category: 'part', part: { family: 'tracking' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: ['tracking.lookup.label', 'tracking.lookup.placeholder', 'tracking.lookup.submit', 'tracking.lookup.hint', 'tracking.lookup.recent', 'tracking.lookup.invalidReference', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <TrackingFamily.PartHost name="TrackingForm" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
