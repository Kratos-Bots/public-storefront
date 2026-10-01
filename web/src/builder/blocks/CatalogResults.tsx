import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CatalogueFamily } from '@/builder/families.ts';
import { PRODUCT_CARD_TEXT, SECTION_LABEL_TEXT } from '@/builder/blocks/_shared/text-patterns.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The products: a card grid or rows (grid), category sections of rows (list); nothing when empty. */
export const block = defineBlock<{ id: string }>({
  name: 'CatalogResults', label: 'Products', category: 'part', part: { family: 'catalogue' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: ['catalog.group.*', ...PRODUCT_CARD_TEXT, ...SECTION_LABEL_TEXT],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CatalogueFamily.PartHost name="CatalogResults" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
