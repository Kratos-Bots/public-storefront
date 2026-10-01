import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The page's add-to-cart button (in a sheet it is pinned to the footer, never arranged). */
export const block = defineBlock<{ id: string }>({
  name: 'ProductAddToCart', label: 'Add to cart button', category: 'part', part: { family: 'product' },
  layouts: ['storefront'], routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: ['product.add.*', 'common.product.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductAddToCart" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
