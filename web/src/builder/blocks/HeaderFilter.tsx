import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { HeaderFamily } from '@/builder/family-header.ts';
import { BAR } from '@/builder/blocks/_shared/header-container.ts';
import { styleSupport, VIS } from '@/builder/style/model.ts';

/** Opens the category picker (menu and web app headers, on the catalogue). */
export const block = defineBlock<{ id: string }>({
  name: 'HeaderFilter', label: 'Categories button', category: 'part', part: { family: 'header' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BAR, ...VIS]),
  text: ['shell.header.categories', 'shell.header.categoriesFiltered'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <HeaderFamily.PartHost name="HeaderFilter" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
