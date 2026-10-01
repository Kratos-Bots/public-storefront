import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CatalogueFamily } from '@/builder/families.ts';
import { SECTION_LABEL_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The page heading with its result count (grid) or tally (list). */
export const block = defineBlock<{ id: string }>({
  name: 'CatalogTitle', label: 'Title and count', category: 'part', part: { family: 'catalogue' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['catalog.list.allProducts', 'catalog.list.count', 'catalog.list.matching', 'catalog.list.unit', 'catalog.list.of', ...SECTION_LABEL_TEXT],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CatalogueFamily.PartHost name="CatalogTitle" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
