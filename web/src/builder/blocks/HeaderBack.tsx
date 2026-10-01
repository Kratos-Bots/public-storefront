import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { HeaderFamily } from '@/builder/family-header.ts';
import { BAR } from '@/builder/blocks/_shared/header-container.ts';
import { styleSupport, VIS } from '@/builder/style/model.ts';

/** The web app's back chevron (outside Telegram, off the catalogue). */
export const block = defineBlock<{ id: string }>({
  name: 'HeaderBack', label: 'Back button', category: 'part', part: { family: 'header' },
  layouts: ['webapp'], routeBound: false, slots: [],
  style: styleSupport('root', [...BAR, ...VIS]),
  text: ['shell.webapp.back'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <HeaderFamily.PartHost name="HeaderBack" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
