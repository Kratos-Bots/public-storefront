import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CartFamily } from '@/builder/family-cart.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The cart page title: eyebrow, heading and item count (the drawer has its own header). */
export const block = defineBlock<{ id: string }>({
  name: 'CartHeading', label: 'Cart heading', category: 'part', part: { family: 'cart' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['cart.page.*', 'cart.summary.items'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CartFamily.PartHost name="CartHeading" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
