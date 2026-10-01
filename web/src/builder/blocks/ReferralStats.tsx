import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ReferralsFamily } from '@/builder/family-referrals.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** People referred and orders earned. */
export const block = defineBlock<{ id: string }>({
  name: 'ReferralStats', label: 'Referral stats', category: 'part', part: { family: 'referrals' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.referrals.broughtInAria', 'account.referrals.broughtInTitle', 'account.referrals.peopleReferred', 'account.referrals.ordersEarned'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ReferralsFamily.PartHost name="ReferralStats" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
