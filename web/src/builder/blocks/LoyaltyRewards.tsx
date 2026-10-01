import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { LoyaltyFamily } from '@/builder/family-loyalty.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The rewards ladder with its Redeem buttons. */
export const block = defineBlock<{ id: string }>({
  name: 'LoyaltyRewards', label: 'Rewards', category: 'part', part: { family: 'loyalty' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['account.loyalty.redeemAria', 'account.loyalty.redeemTitle', 'account.loyalty.redeem', 'account.loyalty.cost', 'account.loyalty.worth', 'account.loyalty.pointsToGo', 'account.loyalty.nothingToRedeem'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <LoyaltyFamily.PartHost name="LoyaltyRewards" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
