import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProfileFamily } from '@/builder/family-profile.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Chat links, shown in the web app. */
export const block = defineBlock<{ id: string }>({
  name: 'ProfileContact', label: 'Talk to us', category: 'part', part: { family: 'profile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.profile.contactAria', 'account.profile.talkToUs', 'common.contact.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProfileFamily.PartHost name="ProfileContact" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
