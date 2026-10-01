import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CheckoutFamily } from '@/builder/family-checkout.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The discount code entry. Without it no code is applied to the order. */
export const block = defineBlock<{ id: string }>({
  name: 'CheckoutCoupon', label: 'Discount code', category: 'part', part: { family: 'checkout' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: ['checkout.coupon.*', 'common.status.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CheckoutFamily.PartHost name="CheckoutCoupon" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
