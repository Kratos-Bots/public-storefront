import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { PaymentFamily } from '@/builder/family-payment.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The copyable order reference. */
export const block = defineBlock<{ id: string }>({
  name: 'PaymentReference', label: 'Order reference', category: 'part', part: { family: 'payment' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['payment.reference.label', 'common.actions.copy', 'common.actions.copied', 'order.copy.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <PaymentFamily.PartHost name="PaymentReference" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
