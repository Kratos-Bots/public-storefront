import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const PaymentCancelPage = lazy(() => import('@/features/payment-redirect/PaymentCancelPage.tsx').then((m) => ({ default: m.PaymentCancelPage })));

export const block = defineBlock<{ id: string }>({
  name: 'PaymentCancel', label: 'Payment cancelled', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  schema: z.object({}), defaultProps: {},
  render: () => <PaymentCancelPage />,
});
