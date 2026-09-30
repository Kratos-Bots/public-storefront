import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const VerifyPage = lazy(() => import('@/features/verify/VerifyPage.tsx').then((m) => ({ default: m.VerifyPage })));

export const block = defineBlock<{ id: string }>({
  name: 'VerifyForm', label: 'Product verification', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  text: ['verify.*', 'checkout.errors.required', 'common.status.checking', 'common.contact.*', 'common.actions.*'],
  schema: z.object({}), defaultProps: {},
  render: () => <VerifyPage />,
});
