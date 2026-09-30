import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The product's description (nothing when it has none). */
export const block = defineBlock<{ id: string }>({
  name: 'ProductDescription', label: 'Description', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['product.sheet.description'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductDescription" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
