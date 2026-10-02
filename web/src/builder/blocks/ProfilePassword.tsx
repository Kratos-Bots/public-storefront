import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { ProfileFamily } from '@/builder/family-profile.ts';
import { BOX, TEXT, VIS, styleSupport } from '@/builder/style/model.ts';

/** Set or change the password, and see which email/phone signs in. Draws nothing while the shop has password sign-in off. */
export const block = defineBlock<{ id: string }>({
  name: 'ProfilePassword', label: 'Password', category: 'part', part: { family: 'profile' },
  layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('root', [...BOX, ...TEXT, ...VIS]),
  text: [
    'account.password.*', 'auth.password.show', 'auth.password.hide', 'auth.password.kindAria', 'auth.password.byEmail', 'auth.password.byPhone',
    'auth.password.emailLabel', 'auth.password.rule', 'auth.password.tooShort', 'auth.password.tooLong', 'auth.password.taken',
    'auth.password.wrongCurrent', 'auth.password.banned', 'auth.password.phoneInvalid', 'auth.password.unavailable', 'checkout.errors.required',
    'checkout.errors.emailInvalid', 'checkout.phone.*', 'errors.rateLimited', 'common.actions.cancel',
  ],
  schema: z.object({}), defaultProps: {},
  render: (p) => <ProfileFamily.PartHost name="ProfilePassword" props={p as Record<string, unknown>} styleAttrs={p.puck.style} />,
});
