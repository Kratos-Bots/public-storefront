import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Where the product comes from (nothing when it isn't told). */
export const block = defineBlock<{ id: string }>({
  name: 'ProductProvenance', label: 'Provenance', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['product.provenance.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductProvenance" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
