import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Stock chip, pre-order date and minimum order. */
export const block = defineBlock<{ id: string }>({
  name: 'ProductStock', label: 'Stock and limits', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['product.stock.*', 'product.detail.preorderShips', 'product.sheet.ships', 'common.product.preorder', 'product.limit.min'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductStock" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
