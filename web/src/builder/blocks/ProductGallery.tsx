import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** The product's photo (renders nothing when the product has none). */
export const block = defineBlock<{ id: string }>({
  name: 'ProductGallery', label: 'Photo', category: 'part', part: { family: 'product' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProductFamily.PartHost name="ProductGallery" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
