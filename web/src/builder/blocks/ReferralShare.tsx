import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ReferralsFamily } from '@/builder/family-referrals.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The share buttons and their note. */
export const block = defineBlock<{ id: string }>({
  name: 'ReferralShare', label: 'Share buttons', category: 'part', part: { family: 'referrals' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX, ...TEXT, ...VIS]),
  text: ['account.referrals.share', 'account.referrals.shareNote', 'common.contact.whatsapp', 'common.contact.telegram'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ReferralsFamily.PartHost name="ReferralShare" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
