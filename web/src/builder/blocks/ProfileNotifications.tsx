import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProfileFamily } from '@/builder/family-profile.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The This device notifications switch and the list of devices that get order updates. Draws nothing where push is unavailable. */
export const block = defineBlock<{ id: string }>({
  name: 'ProfileNotifications', label: 'Notifications', category: 'part', part: { family: 'profile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.notifications.*'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProfileFamily.PartHost name="ProfileNotifications" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
