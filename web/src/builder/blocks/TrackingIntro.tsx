import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { TrackingFamily } from '@/builder/family-tracking.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The heading before an answer: the masthead, or a one-line strip once an answer is on its way. */
export const block = defineBlock<{ id: string }>({
  name: 'TrackingIntro', label: 'Heading', category: 'part', part: { family: 'tracking' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['tracking.lookup.eyebrow', 'tracking.lookup.title', 'tracking.lookup.lead', 'tracking.lookup.strip', 'tracking.lookup.another'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <TrackingFamily.PartHost name="TrackingIntro" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
