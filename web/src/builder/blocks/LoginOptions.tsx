import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const LoginPage = lazy(() => import('@/features/auth/LoginPage.tsx').then((m) => ({ default: m.LoginPage })));

/** The sign-in page body: heading, the ways in, the returnTo hand-off and the Telegram error state. */
export const block = defineBlock<{ id: string }>({
  name: 'LoginOptions', label: 'Sign-in options', category: 'commerce', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <LoginPage />,
});
