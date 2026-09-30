import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CardRowFamily } from '@/builder/families.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';

/** The action gutter: quick-add, or the quantity stepper once in the cart. */
export const block = defineBlock<{ id: string }>({
  name: 'CardRowAdd', label: 'Add control', category: 'part', part: { family: 'card-row' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['product.add.*', 'product.row.*', 'common.qty.*', 'common.product.preorder'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CardRowFamily.PartHost name="CardRowAdd" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
