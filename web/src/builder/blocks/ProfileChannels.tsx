import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProfileFamily } from '@/builder/family-profile.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Which sign-in channels are linked. */
export const block = defineBlock<{ id: string }>({
  name: 'ProfileChannels', label: 'Linked channels', category: 'part', part: { family: 'profile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.profile.channelsAria', 'account.profile.channelsTitle', 'account.profile.channelLinked', 'account.profile.channelNotLinked', 'account.profile.channelsNote', 'account.profile.email', 'common.contact.telegram', 'common.contact.whatsapp'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProfileFamily.PartHost name="ProfileChannels" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
