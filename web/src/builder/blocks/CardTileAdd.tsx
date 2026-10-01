import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CardTileFamily } from '@/builder/families.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';

/** The quick-add button, lifted above the tile's link. */
export const block = defineBlock<{ id: string }>({
  name: 'CardTileAdd', label: 'Add button', category: 'part', part: { family: 'card-tile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['product.add.*', 'common.product.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CardTileFamily.PartHost name="CardTileAdd" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
