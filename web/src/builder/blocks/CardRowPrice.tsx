import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CardRowFamily } from '@/builder/families.ts';
import { BOX, styleSupport, TEXT, VIS } from '@/builder/style/model.ts';

/** The price in the row's price column. */
export const block = defineBlock<{ id: string }>({
  name: 'CardRowPrice', label: 'Price', category: 'part', part: { family: 'card-row' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  schema: z.object({}), defaultProps: {},
  render: (p) => <CardRowFamily.PartHost name="CardRowPrice" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
