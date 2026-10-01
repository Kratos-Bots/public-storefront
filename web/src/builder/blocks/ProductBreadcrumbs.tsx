import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The category trail back to the shop: the same nav on the page and in the sheet. */
export const block = defineBlock<{ id: string }>({
  name: 'ProductBreadcrumbs', label: 'Breadcrumbs', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['product.detail.breadcrumb', 'product.detail.shop'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductBreadcrumbs" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
