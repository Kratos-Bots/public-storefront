import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CheckoutFamily } from '@/builder/family-checkout.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The order summary beside the steps. */
export const block = defineBlock<{ id: string }>({
  name: 'CheckoutSummary', label: 'Order summary', category: 'part', part: { family: 'checkout' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: ['checkout.summary.*', 'checkout.shipping.*', 'cart.summary.items', 'common.totals.*', 'common.product.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CheckoutFamily.PartHost name="CheckoutSummary" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
