import { z } from 'zod';
import { defineBlock, override, type Override } from '@/builder/define.ts';
import { HeaderFamily } from '@/builder/family-header.ts';
import { BAR } from '@/builder/blocks/_shared/header-container.ts';
import { styleSupport, VIS } from '@/builder/style/model.ts';

/** The cart link with its item count. */
export const block = defineBlock<{ id: string; icon: Override }>({
  name: 'HeaderCart', label: 'Cart', category: 'part', part: { family: 'header' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BAR, ...VIS]),
  text: ['shell.header.cartAriaLabel'],
  schema: z.object({ icon: override() }), defaultProps: { icon: 'inherit' },
  render: (p) => <HeaderFamily.PartHost name="HeaderCart" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
