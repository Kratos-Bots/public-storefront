import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The product's lab report (certificate of analysis); nothing when it has none. Drawn automatically when the owner has not placed it. */
export const block = defineBlock<{ id: string }>({
  name: 'ProductCoa', label: 'Lab report', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['product.coa.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductCoa" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
