import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { HeaderFamily } from '@/builder/family-header.ts';
import { BAR } from '@/builder/blocks/_shared/header-container.ts';
import { styleSupport, VIS } from '@/builder/style/model.ts';

/** The header search field. */
export const block = defineBlock<{ id: string }>({
  name: 'HeaderSearch', label: 'Search', category: 'part', part: { family: 'header' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BAR.filter((k) => k !== 'fg'), ...VIS]),
  text: ['catalog.search.*', 'shell.header.searchPlaceholder'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <HeaderFamily.PartHost name="HeaderSearch" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
