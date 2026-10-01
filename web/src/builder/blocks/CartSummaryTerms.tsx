import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CartSummaryFamily } from '@/builder/family-cart.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The note that shipping and discounts come at checkout. */
export const block = defineBlock<{ id: string }>({
  name: 'CartSummaryTerms', label: 'Terms note', category: 'part', part: { family: 'cart-summary' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['cart.summary.terms'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CartSummaryFamily.PartHost name="CartSummaryTerms" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
