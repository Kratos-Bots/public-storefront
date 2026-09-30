import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { CardRowFamily } from '@/builder/families.ts';
import { ROW_CONTAINER } from '@/builder/blocks/_shared/card-containers.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

/**
 * The row frame: root of a `card:row` document, locked (spec §5.3). Compiled once and rendered
 * per card under that card's context, so it renders through the family's PartHost like a part.
 */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'CardRow', label: 'Product row', category: 'catalogue', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('root', [...BOX]),
  container: ROW_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: (p) => <CardRowFamily.PartHost name="CardRow" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
