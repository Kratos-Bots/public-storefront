import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CatalogueFamily } from '@/builder/families.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** The catalogue search field on the shell's search state. */
export const block = defineBlock<{ id: string }>({
  name: 'CatalogSearch', label: 'Search', category: 'part', part: { family: 'catalogue' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['catalog.search.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CatalogueFamily.PartHost name="CatalogSearch" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
