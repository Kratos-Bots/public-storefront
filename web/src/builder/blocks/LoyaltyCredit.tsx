import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { LoyaltyFamily } from '@/builder/family-loyalty.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The store-credit balance row. */
export const block = defineBlock<{ id: string }>({
  name: 'LoyaltyCredit', label: 'Store credit', category: 'part', part: { family: 'loyalty' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.loyalty.storeCredit'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <LoyaltyFamily.PartHost name="LoyaltyCredit" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
