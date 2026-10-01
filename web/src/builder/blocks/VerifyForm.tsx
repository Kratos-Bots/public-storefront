import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock, slot } from '@/builder/define.ts';
import { VERIFY_CONTAINER } from '@/builder/blocks/_shared/verify-container.ts';
import { BOX, styleSupport } from '@/builder/style/model.ts';
import type { ComponentData } from '@/builder/types.ts';

const VerifyPage = lazy(() => import('@/features/verify/VerifyPage.tsx').then((m) => ({ default: m.VerifyPage })));

/** Product verification: a container of verify parts (spec §5.8). It keeps the fields' state, validation and the verdict. */
export const block = defineBlock<{ id: string; content: ComponentData[] }>({
  name: 'VerifyForm', label: 'Product verification', category: 'post-order', layouts: 'all', routeBound: true, slots: ['content'],
  style: styleSupport('wrap', [...BOX]),
  text: [],
  container: VERIFY_CONTAINER,
  schema: z.object({ content: slot() }), defaultProps: { content: [] },
  render: ({ content }) => <VerifyPage slots={{ content }} />,
});
