import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { PaymentFamily } from '@/builder/family-payment.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** Return to the order or the shop (cancelled), pay over WhatsApp or Telegram (placed), or sign in to reach the order (signed out). */
export const block = defineBlock<{ id: string }>({
  name: 'PaymentActions', label: 'Actions', category: 'part', part: { family: 'payment' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['payment.cancel.returnToOrder', 'payment.cancel.backToShop', 'payment.signIn.action', 'payment.signIn.hint', 'payment.placed.payViaWhatsapp', 'payment.placed.payViaTelegram', 'payment.placed.fallback'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <PaymentFamily.PartHost name="PaymentActions" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
