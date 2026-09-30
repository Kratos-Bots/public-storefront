import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const ProfilePage = lazy(() => import('@/features/account/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })));

export const block = defineBlock<{ id: string }>({
  name: 'Profile', label: 'Profile', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  style: styleSupport('wrap', [...BOX]),
  text: ['account.profile.*', 'account.nav.*', 'common.contact.*', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <ProfilePage />,
});
