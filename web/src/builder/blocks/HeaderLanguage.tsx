import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { HeaderFamily } from '@/builder/family-header.ts';
import { BAR } from '@/builder/blocks/_shared/header-container.ts';
import { styleSupport, VIS } from '@/builder/style/model.ts';

/** The shopper's language switcher: a compact code button opening a list of the shop's languages. Not in any default arrangement. */
export const block = defineBlock<{ id: string }>({
  name: 'HeaderLanguage', label: 'Language switcher', category: 'part', part: { family: 'header' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BAR, ...VIS]),
  text: ['shell.language.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <HeaderFamily.PartHost name="HeaderLanguage" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
