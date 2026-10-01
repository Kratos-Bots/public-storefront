import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { LoyaltyFamily } from '@/builder/family-loyalty.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The note shown while the balance is zero. */
export const block = defineBlock<{ id: string }>({
  name: 'LoyaltyNoPoints', label: 'No points note', category: 'part', part: { family: 'loyalty' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.loyalty.noPoints'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <LoyaltyFamily.PartHost name="LoyaltyNoPoints" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
