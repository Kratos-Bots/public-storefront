import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ReferralsFamily } from '@/builder/family-referrals.ts';
import { BOX, VIS, styleSupport } from '@/builder/style/model.ts';

/** Who referred the shopper, or the form to enter a code. */
export const block = defineBlock<{ id: string }>({
  name: 'ReferralReferrer', label: 'Who referred you', category: 'part', part: { family: 'referrals' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...VIS]),
  text: ['account.referrals.referrerAria', 'account.referrals.referrerTitle', 'account.referrals.referredBy', 'account.referrals.someone', 'account.referrals.enterCodeNote', 'account.referrals.codeAria', 'account.referrals.codePlaceholder', 'account.referrals.apply', 'account.referrals.checking', 'account.referrals.codeFailed'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ReferralsFamily.PartHost name="ReferralReferrer" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
