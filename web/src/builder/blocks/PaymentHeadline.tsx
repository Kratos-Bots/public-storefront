import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { PaymentFamily } from '@/builder/family-payment.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The page's h1. */
export const block = defineBlock<{ id: string }>({
  name: 'PaymentHeadline', label: 'Headline', category: 'part', part: { family: 'payment' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['payment.success.headline', 'payment.cancel.headline', 'payment.placed.headline'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <PaymentFamily.PartHost name="PaymentHeadline" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
