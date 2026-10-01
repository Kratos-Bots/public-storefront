import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { LoyaltyFamily } from '@/builder/family-loyalty.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The points balance, as a meter. */
export const block = defineBlock<{ id: string }>({
  name: 'LoyaltyPoints', label: 'Points balance', category: 'part', part: { family: 'loyalty' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['account.loyalty.points'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <LoyaltyFamily.PartHost name="LoyaltyPoints" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
