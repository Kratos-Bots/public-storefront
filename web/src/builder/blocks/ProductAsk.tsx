import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Ask about this product through the shop's contact links (nothing without links). */
export const block = defineBlock<{ id: string }>({
  name: 'ProductAsk', label: 'Ask a question', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['product.ask.*', 'common.contact.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductAsk" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
