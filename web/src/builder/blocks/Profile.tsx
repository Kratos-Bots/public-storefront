import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { PROFILE_CONTAINER } from '@/builder/blocks/_shared/profile-container.ts';
import type { ComponentData } from '@/builder/types.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';

const ProfilePage = lazy(() => import('@/features/account/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })));

/** The profile tab: a container of profile parts. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'Profile', label: 'Profile', category: 'commerce', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: ['account.profile.loadFailedTitle', 'account.profile.loadFailedBody', 'account.nav.profile', 'common.actions.tryAgain'],
  container: PROFILE_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <ProfilePage slots={{ content }} />,
});
