import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { PaymentFamily } from '@/builder/family-payment.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** The ring with a tick (paid, placed) or a cross (cancelled). */
export const block = defineBlock<{ id: string }>({
  name: 'PaymentMark', label: 'Status mark', category: 'part', part: { family: 'payment' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  
  schema: z.object({}), defaultProps: {},
  render: (p) => <PaymentFamily.PartHost name="PaymentMark" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
