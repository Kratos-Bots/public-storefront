import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CartSummaryFamily } from '@/builder/family-cart.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The subtotal figure and item count. */
export const block = defineBlock<{ id: string }>({
  name: 'CartSummarySubtotal', label: 'Subtotal', category: 'part', part: { family: 'cart-summary' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['common.totals.subtotal', 'cart.summary.items'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CartSummaryFamily.PartHost name="CartSummarySubtotal" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
