import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProfileFamily } from '@/builder/family-profile.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** The switch back to the classic bot (Telegram beta only). */
export const block = defineBlock<{ id: string }>({
  name: 'ProfileBotSwitch', label: 'Back to the classic bot', category: 'part', part: { family: 'profile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: ['account.profile.botAria', 'account.profile.botTitle', 'account.profile.botNote', 'account.profile.botSwitch', 'account.profile.botSwitching', 'account.profile.botConfirm', 'account.profile.botFailed', 'common.actions.cancel'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProfileFamily.PartHost name="ProfileBotSwitch" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
