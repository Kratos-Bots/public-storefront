import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CartSummaryFamily } from '@/builder/family-cart.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The checkout button, or the held note when a line blocks checkout. */
export const block = defineBlock<{ id: string }>({
  name: 'CartSummaryCheckout', label: 'Checkout button', category: 'part', part: { family: 'cart-summary' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: ['cart.summary.checkout', 'cart.summary.held'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CartSummaryFamily.PartHost name="CartSummaryCheckout" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
