import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { HeaderFamily } from '@/builder/family-header.ts';
import { BAR } from '@/builder/blocks/_shared/header-container.ts';
import { styleSupport } from '@/builder/style/model.ts';

/** The shop's mark: the way home from every page. */
export const block = defineBlock<{ id: string }>({
  name: 'HeaderBrand', label: 'Brand', category: 'part', part: { family: 'header' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BAR]),
  text: ['shell.header.homeAriaLabel'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <HeaderFamily.PartHost name="HeaderBrand" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
