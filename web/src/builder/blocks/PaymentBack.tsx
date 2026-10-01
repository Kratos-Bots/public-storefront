import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { PaymentFamily } from '@/builder/family-payment.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** The link back to the shop. */
export const block = defineBlock<{ id: string }>({
  name: 'PaymentBack', label: 'Back to shop', category: 'part', part: { family: 'payment' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['common.actions.backToShop'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <PaymentFamily.PartHost name="PaymentBack" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
