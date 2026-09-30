import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The product's name: the page's only h1 (with the SKU when shown), the sheet's title. */
export const block = defineBlock<{ id: string }>({
  name: 'ProductTitle', label: 'Title', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductTitle" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
