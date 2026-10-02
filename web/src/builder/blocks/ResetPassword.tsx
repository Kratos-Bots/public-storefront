import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { RESET_PASSWORD_CONTAINER } from '@/builder/blocks/_shared/reset-password-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage.tsx').then((m) => ({ default: m.ResetPasswordPage })));

/** The reset-password page: a container of the heading and the form, keeping the token check and the submit. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'ResetPassword', label: 'Reset password', category: 'commerce', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: [],
  container: RESET_PASSWORD_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <ResetPasswordPage slots={{ content }} />,
});
