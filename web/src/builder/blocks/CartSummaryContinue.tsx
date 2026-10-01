import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CartSummaryFamily } from '@/builder/family-cart.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The keep-shopping link. */
export const block = defineBlock<{ id: string }>({
  name: 'CartSummaryContinue', label: 'Keep shopping', category: 'part', part: { family: 'cart-summary' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['cart.summary.keepShopping'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CartSummaryFamily.PartHost name="CartSummaryContinue" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
