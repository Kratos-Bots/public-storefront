import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { CardRowFamily } from '@/builder/families.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

/** A wrapper inside the row: the text column (name and details). */
export const block = defineBlock<{ id: string; kind: 'text'; items: ComponentData[] }>({
  name: 'CardRowGroup', label: 'Group', category: 'part', part: { family: 'card-row' }, layouts: 'all', routeBound: false, slots: ['items'],
  style: styleSupport('root', [...BOX, 'align', ...VIS]),
  schema: z.object({ kind: z.enum(['text']), items: slot() }),
  defaultProps: { kind: 'text', items: [] },
  render: (p) => <CardRowFamily.PartHost name="CardRowGroup" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
