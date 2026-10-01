import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ReferralsFamily } from '@/builder/family-referrals.ts';
import { BOX, TEXT, styleSupport } from '@/builder/style/model.ts';

/** The shopper's referral code with a Copy button. */
export const block = defineBlock<{ id: string }>({
  name: 'ReferralCode', label: 'Your code', category: 'part', part: { family: 'referrals' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT]),
  text: ['account.referrals.yourCode', 'account.referrals.copyAria', 'common.actions.copy', 'common.actions.copied'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ReferralsFamily.PartHost name="ReferralCode" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
