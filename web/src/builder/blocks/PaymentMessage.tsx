import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { PaymentFamily } from '@/builder/family-payment.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The sentence under the headline; on an order placed it is the checkout warning or the chat hint. */
export const block = defineBlock<{ id: string }>({
  name: 'PaymentMessage', label: 'Message', category: 'part', part: { family: 'payment' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['payment.success.detail', 'payment.cancel.detail', 'payment.placed.warning', 'payment.placed.chatHint'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <PaymentFamily.PartHost name="PaymentMessage" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
