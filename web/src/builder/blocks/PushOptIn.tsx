import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { PaymentFamily } from '@/builder/family-payment.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** "Get notified when your order ships": turns on order notifications for this device. Draws nothing where push is unavailable. */
export const block = defineBlock<{ id: string }>({
  name: 'PushOptIn', label: 'Order notifications', category: 'part', part: { family: 'payment' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['payment.placed.notify', 'account.notifications.install.*', 'common.actions.close'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <PaymentFamily.PartHost name="PushOptIn" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
