import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { CardTileFamily } from '@/builder/families.ts';
import { TILE_CONTAINER } from '@/builder/blocks/_shared/card-containers.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

/**
 * The tile frame: root of a `card:tile` document, locked (spec §5.3). Compiled once and rendered
 * per card under that card's context, so it renders through the family's PartHost like a part.
 */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'CardTile', label: 'Product card', category: 'catalogue', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('root', [...BOX]),
  container: TILE_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: (p) => <CardTileFamily.PartHost name="CardTile" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
