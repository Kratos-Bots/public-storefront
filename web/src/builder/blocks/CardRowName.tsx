import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CardRowFamily } from '@/builder/families.ts';
import { BOX, styleSupport, TEXT } from '@/builder/style/model.ts';

/** The product name; the button stretches over the whole row and opens the sheet. */
export const block = defineBlock<{ id: string }>({
  name: 'CardRowName', label: 'Name', category: 'part', part: { family: 'card-row' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  schema: z.object({}), defaultProps: {},
  render: (p) => <CardRowFamily.PartHost name="CardRowName" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
