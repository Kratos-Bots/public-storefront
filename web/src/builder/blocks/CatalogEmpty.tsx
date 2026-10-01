import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { CatalogueFamily } from '@/builder/families.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** Unknown category, no matches or an empty category; nothing otherwise. */
export const block = defineBlock<{ id: string }>({
  name: 'CatalogEmpty', label: 'Empty and not-found states', category: 'part', part: { family: 'catalogue' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['catalog.list.eyebrowCatalogue', 'catalog.list.eyebrowCategory', 'catalog.list.eyebrowSearch', 'catalog.list.categoryMissingDetail', 'catalog.list.noMatchesDetail', 'catalog.list.emptyCategoryDetail', 'catalog.list.showAll', 'common.list.*', 'common.actions.tryAgain'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <CatalogueFamily.PartHost name="CatalogEmpty" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
