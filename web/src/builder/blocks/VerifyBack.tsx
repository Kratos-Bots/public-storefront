import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { VerifyFamily } from '@/builder/family-verify.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** The way back to the shop. */
export const block = defineBlock<{ id: string }>({
  name: 'VerifyBack', label: 'Back to shop link', category: 'part', part: { family: 'verify' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['common.actions.backToShop'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <VerifyFamily.PartHost name="VerifyBack" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
