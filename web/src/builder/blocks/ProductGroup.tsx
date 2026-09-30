import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { ProductFamily } from '@/builder/families.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

/** A wrapper the two surfaces use: side by side (price row), text beside thumbnail, text column. */
export const block = defineBlock<{ id: string; kind: 'priceRow' | 'identity' | 'identityText'; items: ComponentData[] }>({
  name: 'ProductGroup', label: 'Group', category: 'part', part: { family: 'product' }, layouts: 'all', routeBound: false, slots: ['items'],
  style: styleSupport('root', [...BOX, 'align', ...VIS]),
  schema: z.object({ kind: z.enum(['priceRow', 'identity', 'identityText']), items: slot() }),
  defaultProps: { kind: 'priceRow', items: [] },
  render: (p) => <ProductFamily.PartHost name="ProductGroup" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
