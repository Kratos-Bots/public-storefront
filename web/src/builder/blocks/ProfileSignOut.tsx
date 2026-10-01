import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProfileFamily } from '@/builder/family-profile.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

/** The sign-out button. */
export const block = defineBlock<{ id: string }>({
  name: 'ProfileSignOut', label: 'Sign out', category: 'part', part: { family: 'profile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX]),
  text: ['account.profile.signOut', 'account.profile.signingOut'],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProfileFamily.PartHost name="ProfileSignOut" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
