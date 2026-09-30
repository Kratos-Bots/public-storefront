import { lazy } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';

const PaymentSuccessPage = lazy(() => import('@/features/payment-redirect/PaymentSuccessPage.tsx').then((m) => ({ default: m.PaymentSuccessPage })));

export const block = defineBlock<{ id: string }>({
  name: 'PaymentSuccess', label: 'Payment received', category: 'post-order', layouts: 'all', routeBound: true, slots: [],
  text: ['payment.success.*', 'payment.reference.*', 'payment.missing.*', 'order.copy.*', 'order.chat.*', 'order.link.*', 'common.contact.*', 'common.actions.backToShop'],
  schema: z.object({}), defaultProps: {},
  render: () => <PaymentSuccessPage />,
});
