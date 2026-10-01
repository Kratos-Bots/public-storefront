import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProfileFamily } from '@/builder/family-profile.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Name, member since, orders and spend. */
export const block = defineBlock<{ id: string }>({
  name: 'ProfileDetails', label: 'Details', category: 'part', part: { family: 'profile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX, ...TEXT, ...VIS]),
  text: ['account.profile.detailsTitle', 'account.profile.name', 'account.profile.nameNotSet', 'account.profile.memberSince', 'account.profile.orders', 'account.profile.totalSpend'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProfileFamily.PartHost name="ProfileDetails" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
