import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { OrderFamily } from '@/builder/family-order.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The order's review: the rating form once it can be left, then the review itself. Draws nothing otherwise. */
export const block = defineBlock<{ id: string }>({
  name: 'OrderReview', label: 'Review', category: 'part', part: { family: 'order' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['reviews.stars.*', 'reviews.form.*', 'reviews.sent.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <OrderFamily.PartHost name="OrderReview" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
