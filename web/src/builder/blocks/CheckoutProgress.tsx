import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CheckoutFamily } from '@/builder/family-checkout.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** The step progress bar. */
export const block = defineBlock<{ id: string }>({
  name: 'CheckoutProgress', label: 'Progress bar', category: 'part', part: { family: 'checkout' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['checkout.steps.contact', 'checkout.steps.address', 'checkout.steps.shipping', 'checkout.steps.payment', 'checkout.steps.review'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CheckoutFamily.PartHost name="CheckoutProgress" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
