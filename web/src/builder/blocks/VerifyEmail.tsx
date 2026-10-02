import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { VERIFY_EMAIL_CONTAINER } from '@/builder/blocks/_shared/verify-email-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const VerifyEmailPage = lazy(() => import('@/features/auth/VerifyEmailPage.tsx').then((m) => ({ default: m.VerifyEmailPage })));

/** The confirm-your-email page: a container of the heading and the status panel, keeping the one-shot confirmation. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'VerifyEmail', label: 'Verify email', category: 'commerce', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: [],
  container: VERIFY_EMAIL_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <VerifyEmailPage slots={{ content }} />,
});
