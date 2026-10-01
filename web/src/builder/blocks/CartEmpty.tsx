import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CartFamily } from '@/builder/family-cart.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The empty-cart message and its way back to the catalogue. */
export const block = defineBlock<{ id: string }>({
  name: 'CartEmpty', label: 'Empty cart', category: 'part', part: { family: 'cart' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['cart.empty.*', 'cart.page.eyebrow', 'common.actions.browseCatalogue'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CartFamily.PartHost name="CartEmpty" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
