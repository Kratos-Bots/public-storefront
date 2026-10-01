import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CheckoutFamily } from '@/builder/family-checkout.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The notes box. Without it no notes travel with the order. */
export const block = defineBlock<{ id: string }>({
  name: 'CheckoutNotes', label: 'Order notes', category: 'part', part: { family: 'checkout' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: ['checkout.review.notes', 'checkout.review.notesPlaceholder', 'checkout.field.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CheckoutFamily.PartHost name="CheckoutNotes" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
