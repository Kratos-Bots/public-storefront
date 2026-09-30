import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { MenuContactStrip } from '@/layouts/MenuShell.tsx';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';

/** The chat-links strip at the foot; stands down whenever a cart tab claims the foot. */
export const block = defineBlock<{ id: string; catalogOnly: boolean }>({
  name: 'ContactStrip', label: 'Contact strip', category: 'shell', layouts: 'all', routeBound: false, slots: [],
  /* pass, not wrap: the strip is `position: sticky; bottom: 0`; a wrapper sized to it would stop it sticking. */
  style: styleSupport('pass', [...BOX, ...VIS]),
  text: ['common.contact.*'],
  schema: z.object({ catalogOnly: z.boolean() }), defaultProps: { catalogOnly: true },
  render: ({ catalogOnly, puck }) => <MenuContactStrip catalogOnly={catalogOnly} styleAttrs={puck.style} />,
});
