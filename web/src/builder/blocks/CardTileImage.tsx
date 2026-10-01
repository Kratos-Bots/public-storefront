import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CardTileFamily } from '@/builder/families.ts';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';

/** The tile's photo, or the empty well when its siblings have photos (spec §5.3). */
export const block = defineBlock<{ id: string }>({
  name: 'CardTileImage', label: 'Photo', category: 'part', part: { family: 'card-tile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  schema: z.object({}), defaultProps: {},
  render: (p) => <CardTileFamily.PartHost name="CardTileImage" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
