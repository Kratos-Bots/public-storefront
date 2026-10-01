import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CartSummaryFamily } from '@/builder/family-cart.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Notice shown when the cart mixes pre-order and in-stock items. */
export const block = defineBlock<{ id: string }>({
  name: 'CartSummaryNotice', label: 'Pre-order notice', category: 'part', part: { family: 'cart-summary' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['cart.summary.mixedNotice'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CartSummaryFamily.PartHost name="CartSummaryNotice" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
