import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { PRODUCT_CARD_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** What goes with this product: cards on the page, rows that swap the sheet in place. */
export const block = defineBlock<{ id: string }>({
  name: 'ProductUpsells', label: 'Goes with', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['product.upsells.*', ...PRODUCT_CARD_TEXT],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductUpsells" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
