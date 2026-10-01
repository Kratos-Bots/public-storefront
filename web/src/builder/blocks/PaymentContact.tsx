import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { PaymentFamily } from '@/builder/family-payment.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** WhatsApp and Telegram links with the order reference pre-typed. */
export const block = defineBlock<{ id: string }>({
  name: 'PaymentContact', label: 'Contact links', category: 'part', part: { family: 'payment' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['common.contact.*', 'order.chat.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <PaymentFamily.PartHost name="PaymentContact" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
