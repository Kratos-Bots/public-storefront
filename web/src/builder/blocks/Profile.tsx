import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const ProfilePage = lazy(() => import('@/features/account/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })));

export const block = defineBlock<{ id: string }>({
  name: 'Profile', label: 'Profile', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <ProfilePage />,
});
