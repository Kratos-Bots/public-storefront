import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { PaymentFamily } from '@/builder/family-payment.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The small status line above the headline. */
export const block = defineBlock<{ id: string }>({
  name: 'PaymentEyebrow', label: 'Eyebrow', category: 'part', part: { family: 'payment' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['payment.success.eyebrow', 'payment.cancel.eyebrow', 'payment.placed.eyebrow'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <PaymentFamily.PartHost name="PaymentEyebrow" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
