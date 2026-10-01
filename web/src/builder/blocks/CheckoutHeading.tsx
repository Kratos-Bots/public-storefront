import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CheckoutFamily } from '@/builder/family-checkout.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The checkout title: eyebrow and heading. */
export const block = defineBlock<{ id: string }>({
  name: 'CheckoutHeading', label: 'Checkout heading', category: 'part', part: { family: 'checkout' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['checkout.page.eyebrow', 'checkout.page.title', 'checkout.page.guestTitle'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CheckoutFamily.PartHost name="CheckoutHeading" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
