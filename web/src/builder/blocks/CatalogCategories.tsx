import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CatalogueFamily } from '@/builder/families.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** The category chips and rail; nothing when the category picker is off. */
export const block = defineBlock<{ id: string }>({
  name: 'CatalogCategories', label: 'Categories', category: 'part', part: { family: 'catalogue' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('pass', [...BOX, ...VIS]),
  text: ['catalog.nav.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CatalogueFamily.PartHost name="CatalogCategories" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
