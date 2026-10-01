import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CartFamily } from '@/builder/family-cart.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The lines in the cart, with their quantity steppers. */
export const block = defineBlock<{ id: string }>({
  name: 'CartLines', label: 'Cart lines', category: 'part', part: { family: 'cart' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: ['cart.line.*', 'common.qty.*', 'common.product.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CartFamily.PartHost name="CartLines" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
