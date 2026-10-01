import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { LOGIN_CONTAINER } from '@/builder/blocks/_shared/login-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const LoginPage = lazy(() => import('@/features/auth/LoginPage.tsx').then((m) => ({ default: m.LoginPage })));

/** The sign-in page: a container of the heading and the ways in, with the returnTo hand-off and the Telegram error state kept. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'LoginOptions', label: 'Sign-in options', category: 'commerce', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: ['auth.telegram.errorTitle', 'auth.telegram.errorBody', 'common.contact.telegram', 'common.actions.tryAgain'],
  container: LOGIN_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <LoginPage slots={{ content }} />,
});
