import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The quantity price ladder (nothing without tiers). */
export const block = defineBlock<{ id: string }>({
  name: 'ProductBulkPricing', label: 'Bulk pricing', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['product.bulk.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductBulkPricing" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
